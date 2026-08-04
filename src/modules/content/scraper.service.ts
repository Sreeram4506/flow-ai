import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { request as httpRequest, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  chars: number;
  /** Absolute URLs found on the page, de-duplicated. Both internal and external. */
  links: string[];
  /**
   * Standard page metadata (og:image, theme-color, description, favicon...).
   * Interpreting it is the caller's job; the scraper only surfaces it.
   */
  meta: Record<string, string>;
}

export interface ScrapeOutcome {
  pages: ScrapedPage[];
  /** url -> why it was skipped. Surfaced so a thin brief is explainable. */
  skipped: Record<string, string>;
}

/**
 * Fetches the pages that research surfaced and extracts their readable text.
 *
 * Why this exists: grounded search returns the *model's summary* of results plus
 * citation URLs. Summaries flatten exactly the specifics that make content
 * concrete - figures, product names, quotes, dates. Reading the source pages
 * gives the brief real material to work from instead of a paraphrase.
 *
 * SECURITY - this is the one place in the app that makes outbound HTTP to
 * addresses the operator did not choose, so it is a classic SSRF sink. A
 * research topic influences which URLs a search engine returns, which means an
 * attacker who can set a topic has partial influence over what this fetches.
 * Every URL is therefore validated *after DNS resolution* and again on every
 * redirect hop, because a public hostname can resolve to (or redirect to)
 * 127.0.0.1, a private range, or a cloud metadata endpoint.
 *
 * That check-then-connect sequence has its own gap if the two steps re-resolve
 * DNS independently: a validated hostname could rebind to a private address in
 * the moment between the check and the request. `assertSafeUrl` returns the
 * exact address it validated, and the request is made with a custom `lookup`
 * that pins the connection to that address — the hostname is still sent for
 * the Host header, SNI and TLS certificate validation, but no second DNS
 * query ever happens, so there is nothing left to race.
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  private readonly userAgent: string;
  private readonly enabled: boolean;
  private readonly respectRobots: boolean;
  private readonly timeoutMs = 10_000;
  private readonly maxBytes = 2 * 1024 * 1024;
  private readonly maxCharsPerPage = 8_000;
  private readonly maxRedirects = 3;
  private readonly concurrency = 4;

  /** robots.txt disallow rules per host, cached for the process lifetime. */
  private readonly robotsCache = new Map<string, string[]>();

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('scraper.enabled') !== false;
    this.respectRobots = this.configService.get<boolean>('scraper.respectRobots') !== false;
    this.userAgent =
      this.configService.get<string>('scraper.userAgent') ||
      `${this.configService.get<string>('app.name') || 'Flow'}Bot/1.0 (+content research; respects robots.txt)`;
  }

  /**
   * Fetches up to `limit` of the given URLs and returns their extracted text.
   * Never throws: a page that fails is recorded in `skipped` and the rest continue.
   */
  async scrape(urls: string[], limit = 4): Promise<ScrapeOutcome> {
    const outcome: ScrapeOutcome = { pages: [], skipped: {} };
    if (!this.enabled) return outcome;

    const unique = [...new Set(urls)].slice(0, Math.max(0, limit));
    if (!unique.length) return outcome;

    // Bounded concurrency: a worker pool over a shared cursor.
    let cursor = 0;
    const workers = Array.from({ length: Math.min(this.concurrency, unique.length) }, async () => {
      while (cursor < unique.length) {
        const url = unique[cursor++];
        try {
          const page = await this.fetchPage(url);
          if (page) outcome.pages.push(page);
          else outcome.skipped[url] = 'no readable content';
        } catch (err: any) {
          outcome.skipped[url] = String(err?.message ?? err).slice(0, 120);
        }
      }
    });
    await Promise.all(workers);

    this.logger.log(
      `Scraped ${outcome.pages.length}/${unique.length} pages (${Object.keys(outcome.skipped).length} skipped)`,
    );
    return outcome;
  }

  // ---------- fetching ----------

  private async fetchPage(startUrl: string): Promise<ScrapedPage | null> {
    let url = startUrl;

    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const pinnedAddress = await this.assertSafeUrl(url);

      if (this.respectRobots && !(await this.robotsAllows(url))) {
        throw new Error('disallowed by robots.txt');
      }

      const parsedUrl = new URL(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: { status: number; headers: Map<string, string>; body: IncomingMessage };
      try {
        // Manual redirects so every hop is re-validated (and re-pinned) against
        // the SSRF guard; auto-following would let a public URL bounce us to an
        // internal address without another check.
        response = await this.pinnedRequest(parsedUrl, pinnedAddress, controller.signal);
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        response.body.destroy();
        const location = response.headers.get('location');
        if (!location) throw new Error(`redirect ${response.status} without location`);
        url = new URL(location, url).toString();
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        response.body.destroy();
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        response.body.destroy();
        throw new Error(`unsupported content-type: ${contentType.split(';')[0] || 'unknown'}`);
      }

      const declared = Number(response.headers.get('content-length') || 0);
      if (declared && declared > this.maxBytes) {
        response.body.destroy();
        throw new Error(`too large (${declared} bytes)`);
      }

      const html = await this.readCapped(response.body);
      const text = this.extractText(html);
      if (text.length < 200) return null;

      return {
        url,
        title: this.extractTitle(html),
        text: text.slice(0, this.maxCharsPerPage),
        chars: Math.min(text.length, this.maxCharsPerPage),
        links: this.extractLinks(html, url),
        meta: this.extractMeta(html, url),
      };
    }

    throw new Error('too many redirects');
  }

  /**
   * Issues the request with the TCP connection pinned to `pinnedAddress` via a
   * custom `lookup`, so no DNS query happens at connect time — the address
   * that was security-checked is the address that gets connected to, full
   * stop. `hostname` is still passed through for the Host header, SNI and TLS
   * certificate verification, so this changes nothing about correctness.
   */
  private pinnedRequest(
    parsedUrl: URL,
    pinnedAddress: string,
    signal: AbortSignal,
  ): Promise<{ status: number; headers: Map<string, string>; body: IncomingMessage }> {
    return new Promise((resolve, reject) => {
      const isHttps = parsedUrl.protocol === 'https:';
      const requestFn = isHttps ? httpsRequest : httpRequest;
      const pinnedFamily = isIP(pinnedAddress);

      const req = requestFn(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: 'GET',
          timeout: this.timeoutMs,
          lookup: (_hostname: string, options: any, callback: any) => {
            if (options?.all) callback(null, [{ address: pinnedAddress, family: pinnedFamily }]);
            else callback(null, pinnedAddress, pinnedFamily);
          },
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en',
          },
        } as any,
        (res: IncomingMessage) => {
          const headers = new Map<string, string>();
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(', '));
          }
          resolve({ status: res.statusCode || 0, headers, body: res });
        },
      );

      req.on('timeout', () => req.destroy(new Error('request timed out')));
      req.on('error', reject);
      signal.addEventListener('abort', () => req.destroy(new Error('request timed out')), { once: true });
      req.end();
    });
  }

  /** Reads the body but stops once the cap is exceeded, so a lying or absent content-length can't exhaust memory. */
  private async readCapped(body: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > this.maxBytes) {
        body.destroy();
        break;
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  // ---------- SSRF guard ----------

  /**
   * Throws unless `raw` is a public http(s) URL. Returns the exact address it
   * validated, so the caller can pin the actual connection to it rather than
   * letting a second, independent DNS lookup decide where the request goes.
   * Exposed for testing - this is the security boundary and is unit tested.
   */
  async assertSafeUrl(raw: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('malformed URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`blocked scheme: ${parsed.protocol}`);
    }
    // Credentials in a URL are never legitimate here and can be used to smuggle
    // auth at an internal endpoint.
    if (parsed.username || parsed.password) throw new Error('credentials in URL are not allowed');

    const host = parsed.hostname.replace(/^\[|\]$/g, '');

    // Resolve to addresses. A literal IP is checked as-is; a hostname is
    // resolved first, because `evil.example.com` may point at 127.0.0.1.
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (!addresses.length) throw new Error('host did not resolve');

    for (const address of addresses) {
      if (this.isPrivateAddress(address)) {
        throw new Error(`blocked non-public address (${address})`);
      }
    }

    return addresses[0];
  }

  /** Loopback, private, link-local (incl. cloud metadata), CGNAT, and reserved ranges. */
  private isPrivateAddress(address: string): boolean {
    const version = isIP(address);

    if (version === 4) {
      const parts = address.split('.').map(Number);
      if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
      const [a, b] = parts;
      if (a === 0) return true; // "this network"
      if (a === 10) return true; // private
      if (a === 127) return true; // loopback
      if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
      if (a === 172 && b >= 16 && b <= 31) return true; // private
      if (a === 192 && b === 168) return true; // private
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      if (a === 192 && b === 0) return true; // IETF protocol assignments
      if (a >= 224) return true; // multicast, reserved, broadcast
      return false;
    }

    if (version === 6) {
      const v6 = address.toLowerCase();
      if (v6 === '::' || v6 === '::1') return true; // unspecified / loopback
      if (v6.startsWith('fe80')) return true; // link-local
      if (/^f[cd]/.test(v6)) return true; // unique local

      // IPv4-mapped addresses must be judged on the embedded IPv4 address.
      // Note WHATWG URL normalises `::ffff:127.0.0.1` to the hex form
      // `::ffff:7f00:1`, so matching only the dotted-quad spelling would let
      // loopback through - expand the address and read the last 32 bits.
      const embedded = this.embeddedIpv4(v6);
      if (embedded) return this.isPrivateAddress(embedded);
      return false;
    }

    return true; // not a recognisable IP - refuse
  }

  /**
   * Returns the dotted-quad IPv4 embedded in an IPv4-mapped/compatible IPv6
   * address (`::ffff:a.b.c.d` or its normalised `::ffff:HHHH:HHHH` form), or
   * null when the address carries no IPv4.
   */
  private embeddedIpv4(v6: string): string | null {
    const dotted = v6.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
    if (dotted) return dotted[1];

    // Expand "::" into the omitted zero groups so positions are unambiguous.
    const [head, tail] = v6.split('::');
    const headGroups = head ? head.split(':').filter(Boolean) : [];
    const tailGroups = tail !== undefined && tail ? tail.split(':').filter(Boolean) : [];
    const missing = 8 - headGroups.length - tailGroups.length;
    if (v6.includes('::') && missing < 0) return null;
    const groups = v6.includes('::')
      ? [...headGroups, ...Array(missing).fill('0'), ...tailGroups]
      : v6.split(':');
    if (groups.length !== 8) return null;

    // ::ffff:0:0/96 - the first five groups zero and the sixth ffff.
    const isMapped =
      groups.slice(0, 5).every((g) => parseInt(g, 16) === 0) && parseInt(groups[5], 16) === 0xffff;
    if (!isMapped) return null;

    const high = parseInt(groups[6], 16);
    const low = parseInt(groups[7], 16);
    if (Number.isNaN(high) || Number.isNaN(low)) return null;
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }

  // ---------- robots.txt ----------

  private async robotsAllows(rawUrl: string): Promise<boolean> {
    const url = new URL(rawUrl);
    const key = url.origin;

    if (!this.robotsCache.has(key)) {
      this.robotsCache.set(key, await this.loadRobots(key));
    }
    const disallowed = this.robotsCache.get(key) || [];
    const path = url.pathname || '/';
    return !disallowed.some((rule) => rule && path.startsWith(rule));
  }

  /** Returns Disallow paths that apply to us. Fetch failures mean "no rules". */
  private async loadRobots(origin: string): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        signal: controller.signal,
        headers: { 'User-Agent': this.userAgent },
        redirect: 'follow',
      });
      if (!response.ok) return [];
      const body = (await response.text()).slice(0, 100_000);
      return this.parseRobots(body);
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** Minimal robots parser: collects Disallow rules from the `*` group. */
  private parseRobots(body: string): string[] {
    const disallowed: string[] = [];
    let inWildcardGroup = false;

    for (const line of body.split(/\r?\n/)) {
      const clean = line.split('#')[0].trim();
      if (!clean) continue;
      const [rawKey, ...rest] = clean.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (key === 'user-agent') {
        inWildcardGroup = value === '*';
      } else if (key === 'disallow' && inWildcardGroup && value) {
        disallowed.push(value);
      }
    }
    return disallowed;
  }

  // ---------- HTML -> text ----------

  private extractTitle(html: string): string {
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (og) return this.decode(og[1]).slice(0, 200);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return title ? this.decode(this.stripTags(title[1])).trim().slice(0, 200) : '';
  }

  /**
   * Deliberately dependency-free. The output only ever feeds a language model,
   * so structural fidelity matters far less than removing boilerplate - a full
   * DOM parser would add weight without changing the brief.
   */
  private extractText(html: string): string {
    let working = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|svg|canvas|form|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      // Chrome/navigation furniture that would otherwise dominate short pages.
      .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

    // Prefer the main content region when the page marks one.
    const main =
      working.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
      working.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    if (main && main[1].length > 500) working = main[1];

    return this.decode(
      working
        .replace(/<\/(p|div|section|li|h[1-6]|tr|br)\s*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    )
      // \u00A0 is the non-breaking space HTML is full of. Written as an
      // escape rather than a literal, so it stays visible in review.
      .replace(/[ \t\u00A0]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
  }

  /**
   * Every `href` on the page, resolved to an absolute URL. Anchors, mailto:
   * and tel: are dropped; the caller decides what is interesting.
   */
  private extractLinks(html: string, baseUrl: string): string[] {
    const links = new Set<string>();
    const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
      const raw = this.decode(match[1]).trim();
      if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) continue;
      try {
        const resolved = new URL(raw, baseUrl);
        if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
          resolved.hash = '';
          links.add(resolved.toString());
        }
      } catch {
        // Unparseable href - ignore rather than fail the page.
      }
      if (links.size >= 300) break;
    }
    return [...links];
  }

  /** Standard metadata: og:*, twitter:*, theme-color, description, and the favicon. */
  private extractMeta(html: string, baseUrl: string): Record<string, string> {
    const meta: Record<string, string> = {};

    const tagPattern = /<meta\b[^>]*>/gi;
    let tag: RegExpExecArray | null;
    while ((tag = tagPattern.exec(html)) !== null) {
      const el = tag[0];
      const key = el.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      const value = el.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
      if (key && value && !meta[key]) meta[key] = this.decode(value).trim().slice(0, 500);
    }

    const icon = html.match(/<link\b[^>]*\brel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i)?.[0];
    const iconHref = icon?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (iconHref) {
      try {
        meta.favicon = new URL(this.decode(iconHref), baseUrl).toString();
      } catch {
        /* ignore an unparseable icon href */
      }
    }
    return meta;
  }

  private stripTags(value: string): string {
    return value.replace(/<[^>]+>/g, '');
  }

  private decode(value: string): string {
    return value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
      .replace(/&mdash;|&#8212;/g, '—')
      .replace(/&ndash;|&#8211;/g, '–')
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      // Hex character references (&#x27; &#x2F; ...) are extremely common in
      // real markup. Leaving them undecoded left fragments like "#x27" in the
      // extracted text, which then looked like a hashtag to callers.
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  }
}
