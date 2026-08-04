import { ScraperService } from './scraper.service';

/**
 * The scraper is the only place the app makes outbound HTTP to addresses the
 * operator did not choose, so its URL guard is a security boundary: a research
 * topic influences which URLs a search engine returns, giving an attacker
 * partial influence over what the server fetches.
 *
 * DNS is stubbed so a hostname can be pointed at an internal address — the
 * rebinding case that a naive string check on the hostname would miss.
 */
jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

import { lookup } from 'dns/promises';

const mockedLookup = lookup as unknown as jest.Mock;

describe('ScraperService URL guard', () => {
  let service: ScraperService;

  const configFor = (values: Record<string, any> = {}) =>
    ({ get: (key: string) => values[key] }) as any;

  const resolvesTo = (...addresses: string[]) =>
    mockedLookup.mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScraperService(configFor());
    // Default: hostnames resolve to an ordinary public address.
    resolvesTo('93.184.216.34');
  });

  describe('rejects non-public targets', () => {
    it.each([
      ['loopback by name', 'http://localhost/admin', '127.0.0.1'],
      ['loopback by literal', 'http://127.0.0.1:3002/api', '127.0.0.1'],
      ['private 10/8', 'http://10.0.0.5/', '10.0.0.5'],
      ['private 192.168/16', 'http://192.168.1.1/', '192.168.1.1'],
      ['private 172.16/12', 'http://172.20.0.9/', '172.20.0.9'],
      ['cloud metadata', 'http://169.254.169.254/latest/meta-data/', '169.254.169.254'],
      ['CGNAT', 'http://100.100.0.1/', '100.100.0.1'],
      ['IPv6 loopback', 'http://[::1]/', '::1'],
      ['IPv6 unique-local', 'http://[fd00::1]/', 'fd00::1'],
      // WHATWG URL normalises this to the hex form `::ffff:7f00:1`; an earlier
      // implementation only matched the dotted-quad spelling and let it through.
      ['IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/', '::ffff:7f00:1'],
      ['IPv4-mapped metadata', 'http://[::ffff:169.254.169.254]/', '::ffff:a9fe:a9fe'],
      ['IPv4-mapped private', 'http://[::ffff:10.0.0.1]/', '::ffff:a00:1'],
    ])('blocks %s', async (_label, url, address) => {
      resolvesTo(address);
      await expect(service.assertSafeUrl(url)).rejects.toThrow(/non-public address/);
    });

    it('blocks a public hostname that resolves to a private address (DNS rebinding)', async () => {
      resolvesTo('127.0.0.1');
      await expect(service.assertSafeUrl('https://totally-normal.example.com/post')).rejects.toThrow(
        /non-public address/,
      );
    });

    it('blocks when ANY resolved address is private, not just the first', async () => {
      resolvesTo('93.184.216.34', '10.1.2.3');
      await expect(service.assertSafeUrl('https://mixed.example.com/')).rejects.toThrow(/non-public address/);
    });

    it.each([
      ['file', 'file:///etc/passwd'],
      ['gopher', 'gopher://example.com/'],
      ['data', 'data:text/html,<h1>hi</h1>'],
    ])('blocks the %s scheme', async (_label, url) => {
      await expect(service.assertSafeUrl(url)).rejects.toThrow(/blocked scheme|malformed URL/);
    });

    it('blocks credentials embedded in the URL', async () => {
      await expect(service.assertSafeUrl('http://admin:secret@example.com/')).rejects.toThrow(
        /credentials in URL/,
      );
    });

    it('rejects a malformed URL', async () => {
      await expect(service.assertSafeUrl('not-a-url')).rejects.toThrow(/malformed URL/);
    });

    it('rejects a host that does not resolve', async () => {
      mockedLookup.mockResolvedValue([]);
      await expect(service.assertSafeUrl('https://nowhere.example.com/')).rejects.toThrow(/did not resolve/);
    });
  });

  describe('allows legitimate targets', () => {
    it('allows a normal https page and returns the address it validated', async () => {
      // The resolved address is returned so the caller can pin the actual
      // connection to it instead of re-resolving DNS a second time (the fix
      // for the rebinding TOCTOU covered above).
      await expect(service.assertSafeUrl('https://example.com/article')).resolves.toBe('93.184.216.34');
    });

    it('allows a public IPv4 literal and returns it unchanged', async () => {
      resolvesTo('8.8.8.8');
      await expect(service.assertSafeUrl('http://8.8.8.8/')).resolves.toBe('8.8.8.8');
    });

    it('allows a public IPv6 literal and returns it unchanged', async () => {
      resolvesTo('2606:4700:4700::1111');
      await expect(service.assertSafeUrl('https://[2606:4700:4700::1111]/')).resolves.toBe('2606:4700:4700::1111');
    });
  });

  describe('scrape()', () => {
    it('returns nothing and makes no requests when disabled', async () => {
      const disabled = new ScraperService(configFor({ 'scraper.enabled': false }));
      const result = await disabled.scrape(['https://example.com/']);
      expect(result.pages).toEqual([]);
      expect(mockedLookup).not.toHaveBeenCalled();
    });

    it('records a reason per skipped URL instead of throwing', async () => {
      resolvesTo('127.0.0.1');
      const result = await service.scrape(['https://blocked.example.com/']);
      expect(result.pages).toEqual([]);
      expect(result.skipped['https://blocked.example.com/']).toMatch(/non-public address/);
    });

    it('honours the page limit and de-duplicates', async () => {
      resolvesTo('127.0.0.1'); // everything blocked; we only assert on counts
      const result = await service.scrape(
        ['https://a.example.com/', 'https://a.example.com/', 'https://b.example.com/', 'https://c.example.com/'],
        2,
      );
      expect(Object.keys(result.skipped)).toHaveLength(2);
    });
  });
});
