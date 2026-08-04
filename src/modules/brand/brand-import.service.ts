import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ScraperService, ScrapedPage } from '../content/scraper.service';
import { AI_PROVIDER, AiProvider } from '../content/providers/ai-provider.interface';
import { BrandService } from './brand.service';

/** Fields the importer is allowed to infer from a website. */
const TEXT_FIELDS = [
  'companyName',
  'tagline',
  'description',
  'mission',
  'industry',
  'targetAudience',
  'toneOfVoice',
  'contentGuidelines',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

export type Confidence = 'high' | 'medium' | 'low';

export interface ExtractedField {
  value: string;
  confidence: Confidence;
  /** Why the model believes it - usually the phrase it was taken from. */
  evidence?: string;
  /** True when the value was written to the profile. */
  saved: boolean;
  /** Why it was not saved, when applicable. */
  skippedReason?: string;
}

export interface BrandImportResult {
  websiteUrl: string;
  /** Pages actually read, in the order they were fetched. */
  pagesRead: { url: string; title: string; chars: number }[];
  pagesSkipped: Record<string, string>;
  fields: Partial<Record<TextField, ExtractedField>>;
  /** Non-text signals lifted straight from the markup rather than inferred. */
  detected: {
    logoUrl?: string;
    brandColors: string[];
    instagramHandle?: string;
    linkedinPage?: string;
    hashtagDefaults: string[];
  };
  saved: boolean;
  /** Present when nothing usable came back, explaining why. */
  warning?: string;
  profile?: unknown;
}

/**
 * Builds a brand profile by reading the company's own website.
 *
 * The brand profile is injected into *every* agent prompt, so a wrong value
 * here quietly contaminates all generated content. Two safeguards follow from
 * that:
 *
 *  - **Per-field confidence.** The model must say how sure it is and cite the
 *    phrase it took each value from. Low-confidence guesses are returned for
 *    review but not written, because a plausible-sounding invented mission
 *    statement is worse than an empty one.
 *  - **Human edits win.** A field already set on the profile is never
 *    overwritten unless the caller explicitly asks, so re-running an import
 *    can't undo someone's wording.
 *
 * SECURITY: the URL here is supplied directly by the caller, which is a
 * stronger SSRF vector than the search-result URLs the scraper normally sees.
 * It goes through the same `ScraperService` guard (post-DNS validation, every
 * redirect hop re-checked, private ranges refused).
 */
@Injectable()
export class BrandImportService {
  private readonly logger = new Logger(BrandImportService.name);

  /** Homepage plus this many discovered pages. */
  private readonly maxPages = 5;

  constructor(
    private readonly scraper: ScraperService,
    private readonly brandService: BrandService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async importFromWebsite(
    orgId: string,
    rawUrl: string,
    options: { save?: boolean; overwrite?: boolean } = {},
  ): Promise<BrandImportResult> {
    const { save = true, overwrite = false } = options;
    const websiteUrl = this.normaliseUrl(rawUrl);

    // Fail fast and clearly on an unreachable or non-public URL, rather than
    // returning an empty profile that looks like the site had nothing on it.
    try {
      await this.scraper.assertSafeUrl(websiteUrl);
    } catch (err: any) {
      throw new BadRequestException(`Cannot import from that URL: ${err.message}`);
    }

    const home = (await this.scraper.scrape([websiteUrl], 1)).pages[0];
    if (!home) {
      throw new BadRequestException(
        `Could not read ${websiteUrl}. The site may be unreachable, blocked by robots.txt, ` +
          `or render its content entirely with JavaScript (this reads server-delivered HTML only).`,
      );
    }

    // Follow the pages that actually describe a company.
    const followUps = this.pickInformativeLinks(home, this.maxPages - 1);
    const rest = followUps.length ? await this.scraper.scrape(followUps, followUps.length) : { pages: [], skipped: {} };
    const pages = [home, ...rest.pages];

    const detected = this.detectFromMarkup(pages);
    const fields = await this.extractFields(pages, websiteUrl);

    const result: BrandImportResult = {
      websiteUrl,
      pagesRead: pages.map((p) => ({ url: p.url, title: p.title, chars: p.chars })),
      pagesSkipped: rest.skipped,
      fields,
      detected,
      saved: false,
    };

    if (!Object.keys(fields).length) {
      result.warning =
        'No brand details could be extracted with usable confidence. Check the site is text-based and try again, or fill the profile in manually.';
      return result;
    }

    if (save) {
      result.profile = await this.persist(orgId, websiteUrl, fields, detected, overwrite);
      result.saved = true;
    }
    return result;
  }

  // ---------- page selection ----------

  /**
   * Picks same-origin pages whose URL or link text suggests they describe the
   * company. Ranked, because reading five blog posts teaches us less about the
   * brand than one About page.
   */
  private pickInformativeLinks(home: ScrapedPage, limit: number): string[] {
    const origin = new URL(home.url).origin;
    const priority: [RegExp, number][] = [
      [/\/about/i, 10],
      [/\/who-we-are|\/our-story|\/company/i, 9],
      [/\/services|\/what-we-do|\/solutions/i, 8],
      [/\/products?/i, 6],
      [/\/mission|\/values|\/culture/i, 6],
      [/\/contact/i, 3],
    ];

    const scored = home.links
      .filter((link) => {
        try {
          const u = new URL(link);
          if (u.origin !== origin) return false;
          // Skip obvious non-prose destinations.
          return !/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|css|js)$/i.test(u.pathname);
        } catch {
          return false;
        }
      })
      .map((link) => {
        const path = new URL(link).pathname;
        const score = priority.reduce((best, [re, weight]) => (re.test(path) ? Math.max(best, weight) : best), 0);
        return { link, score, depth: path.split('/').filter(Boolean).length };
      })
      .filter((c) => c.score > 0 && c.link !== home.url)
      // Highest-signal first; shallower paths win ties (/about beats /about/team).
      .sort((a, b) => b.score - a.score || a.depth - b.depth);

    const seenPaths = new Set<string>();
    const picked: string[] = [];
    for (const candidate of scored) {
      const path = new URL(candidate.link).pathname.replace(/\/$/, '');
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      picked.push(candidate.link);
      if (picked.length >= limit) break;
    }
    return picked;
  }

  // ---------- markup-derived signals ----------

  /**
   * Values taken verbatim from the markup. These are observations, not
   * inferences, so they are saved without a confidence gate.
   */
  private detectFromMarkup(pages: ScrapedPage[]): BrandImportResult['detected'] {
    const detected: BrandImportResult['detected'] = { brandColors: [], hashtagDefaults: [] };
    const colors = new Set<string>();
    const hashtags = new Set<string>();

    for (const page of pages) {
      const meta = page.meta || {};

      if (!detected.logoUrl) detected.logoUrl = meta['og:image'] || meta['twitter:image'] || meta.favicon;

      const themeColor = meta['theme-color'];
      if (themeColor && /^#?[0-9a-f]{3,8}$/i.test(themeColor.trim())) {
        colors.add(this.normaliseHex(themeColor));
      }

      for (const link of page.links || []) {
        const instagram = link.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
        if (instagram && !detected.instagramHandle && !/^(p|reel|explore|accounts)$/i.test(instagram[1])) {
          detected.instagramHandle = `@${instagram[1].replace(/\/$/, '')}`;
        }
        const linkedin = link.match(/linkedin\.com\/(company|school)\/[A-Za-z0-9._-]+/i);
        if (linkedin && !detected.linkedinPage) detected.linkedinPage = link.split('?')[0];
      }

      for (const tag of page.text.match(/(?:^|\s)(#[A-Za-z][A-Za-z0-9_]{2,29})\b/gm) || []) {
        const clean = tag.trim();
        // Belt and braces against undecoded character references (`&#x27;`)
        // surviving as something that looks like a hashtag.
        if (/^#x[0-9a-f]+$/i.test(clean)) continue;
        hashtags.add(clean);
      }
    }

    detected.brandColors = [...colors].slice(0, 6);
    detected.hashtagDefaults = [...hashtags].slice(0, 8);
    return detected;
  }

  private normaliseHex(value: string): string {
    const hex = value.trim().replace(/^#/, '');
    return `#${hex.toLowerCase()}`;
  }

  // ---------- AI extraction ----------

  private async extractFields(
    pages: ScrapedPage[],
    websiteUrl: string,
  ): Promise<Partial<Record<TextField, ExtractedField>>> {
    if (!this.provider.available) {
      this.logger.warn('No AI provider configured - brand fields cannot be extracted from page text');
      return {};
    }

    const corpus = pages
      .map((p) => `--- PAGE: ${p.title || p.url}\n(${p.url})\n${p.text}`)
      .join('\n\n')
      .slice(0, 30_000);

    const raw = await this.provider.generateText(
      `You are reading a company's own website in order to fill in their brand profile.\n\n` +
        `=== WEBSITE CONTENT (${websiteUrl}) ===\n${corpus}\n\n` +
        `=== TASK ===\n` +
        `Extract the fields below. For each one you are confident about, return an object with:\n` +
        `  "value"      - the extracted value\n` +
        `  "confidence" - "high" | "medium" | "low"\n` +
        `  "evidence"   - the short phrase from the page that supports it\n\n` +
        `Fields:\n` +
        `- companyName: the trading name\n` +
        `- tagline: their own short strapline, if they have one\n` +
        `- description: 2-3 sentences on what the company does\n` +
        `- mission: their stated mission or purpose\n` +
        `- industry: the sector they operate in\n` +
        `- targetAudience: who they sell to\n` +
        `- toneOfVoice: how their copy reads (e.g. "warm and plain-spoken, avoids jargon")\n` +
        `- contentGuidelines: dos and don'ts implied by their existing copy\n\n` +
        `RULES - these matter more than completeness:\n` +
        `- OMIT any field the site does not support. A missing field is fine; an invented one is not.\n` +
        `- Never infer a mission or tagline that is not actually stated. Mark it "low" if you are guessing.\n` +
        `- Use "high" ONLY when the page states it near-verbatim.\n` +
        `- toneOfVoice and contentGuidelines are judgements about the writing, so "high" is rarely right.\n\n` +
        `Return ONLY a JSON object keyed by field name, no markdown fences.`,
    );

    return this.parseFields(raw);
  }

  private parseFields(raw: string): Partial<Record<TextField, ExtractedField>> {
    const obj = this.parseJson(raw);
    const fields: Partial<Record<TextField, ExtractedField>> = {};

    for (const name of TEXT_FIELDS) {
      const entry = obj[name];
      if (!entry) continue;

      // Tolerate a bare string in place of the documented object shape.
      const value = typeof entry === 'string' ? entry : entry.value;
      if (typeof value !== 'string' || !value.trim()) continue;

      const confidence: Confidence =
        typeof entry === 'object' && ['high', 'medium', 'low'].includes(entry.confidence)
          ? entry.confidence
          : 'low';

      fields[name] = {
        value: value.trim(),
        confidence,
        evidence: typeof entry === 'object' && typeof entry.evidence === 'string' ? entry.evidence : undefined,
        saved: false,
      };
    }
    return fields;
  }

  // ---------- persistence ----------

  private async persist(
    orgId: string,
    websiteUrl: string,
    fields: Partial<Record<TextField, ExtractedField>>,
    detected: BrandImportResult['detected'],
    overwrite: boolean,
  ) {
    const existing = await this.brandService.getOrNull(orgId);
    const data: Record<string, unknown> = { websiteUrl };

    for (const name of TEXT_FIELDS) {
      const field = fields[name];
      if (!field) continue;

      if (field.confidence === 'low') {
        field.skippedReason = 'low confidence - returned for review but not saved';
        continue;
      }
      const current = (existing as Record<string, any> | null)?.[name];
      if (current && !overwrite) {
        field.skippedReason = 'already set on the profile; pass overwrite=true to replace it';
        continue;
      }
      data[name] = field.value;
      field.saved = true;
    }

    const assignDetected = (key: string, value: unknown) => {
      if (value === undefined || (Array.isArray(value) && !value.length)) return;
      const current = (existing as Record<string, any> | null)?.[key];
      const currentIsSet = Array.isArray(current) ? current.length > 0 : Boolean(current);
      if (currentIsSet && !overwrite) return;
      data[key] = value;
    };
    assignDetected('logoUrl', detected.logoUrl);
    assignDetected('brandColors', detected.brandColors);
    assignDetected('instagramHandle', detected.instagramHandle);
    assignDetected('linkedinPage', detected.linkedinPage);
    assignDetected('hashtagDefaults', detected.hashtagDefaults);

    // Update and create are handled separately rather than via a single upsert.
    // On a re-import every field can legitimately be skipped (already set, not
    // overwriting), leaving `data` without companyName — and Prisma validates
    // an upsert's `create` branch even when it takes the update path, so the
    // whole call would fail on a profile that needed no changes at all.
    if (existing) return this.brandService.update(orgId, data as any);

    // companyName is required by the schema; fall back to the domain rather
    // than fail the import when the site never states its name plainly.
    data.companyName =
      data.companyName || fields.companyName?.value || new URL(websiteUrl).hostname.replace(/^www\./, '');
    return this.brandService.upsert(orgId, data as any);
  }

  // ---------- helpers ----------

  /** Accepts "example.com" as well as a full URL. */
  private normaliseUrl(raw: string): string {
    const trimmed = (raw || '').trim();
    if (!trimmed) throw new BadRequestException('A website URL is required');
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      return new URL(withScheme).toString();
    } catch {
      throw new BadRequestException(`"${raw}" is not a valid website URL`);
    }
  }

  private parseJson(raw: string): Record<string, any> {
    if (!raw) return {};
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return {};
        }
      }
      return {};
    }
  }
}
