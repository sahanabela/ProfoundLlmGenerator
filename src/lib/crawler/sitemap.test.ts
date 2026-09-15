import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: (...args: unknown[]) => fetchMock(...args) }));

import { discoverSitemapUrls } from './sitemap';
import type { RobotsRules } from './robots';

const emptyRobots: RobotsRules = { fetched: true, disallow: [], allow: [], sitemaps: [] };

beforeEach(() => {
  fetchMock.mockReset();
});

describe('discoverSitemapUrls', () => {
  it('parses a plain urlset sitemap', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/sitemap.xml')) {
        return {
          ok: true,
          body: `<?xml version="1.0"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/</loc><priority>1.0</priority></url>
              <url><loc>https://example.com/docs</loc><priority>0.8</priority></url>
            </urlset>`,
        };
      }
      return { ok: false, body: '' };
    });

    const result = await discoverSitemapUrls('https://example.com', emptyRobots, 5000);
    expect(result.map((r) => r.loc)).toEqual(['https://example.com/', 'https://example.com/docs']);
    expect(result[0].priority).toBe(1);
  });

  it('follows a sitemap index to its child sitemaps', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/sitemap_index.xml') || url === 'https://example.com/sitemaps/a.xml') {
        if (url.endsWith('/sitemap_index.xml')) {
          return {
            ok: true,
            body: `<?xml version="1.0"?>
              <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                <sitemap><loc>https://example.com/sitemaps/a.xml</loc></sitemap>
              </sitemapindex>`,
          };
        }
        return {
          ok: true,
          body: `<?xml version="1.0"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/guides/one</loc></url>
            </urlset>`,
        };
      }
      return { ok: false, body: '' };
    });

    const robots: RobotsRules = { ...emptyRobots, sitemaps: ['https://example.com/sitemap_index.xml'] };
    const result = await discoverSitemapUrls('https://example.com', robots, 5000);
    expect(result.map((r) => r.loc)).toContain('https://example.com/guides/one');
  });

  it('returns an empty list when nothing is found', async () => {
    fetchMock.mockResolvedValue({ ok: false, body: '' });
    const result = await discoverSitemapUrls('https://example.com', emptyRobots, 5000);
    expect(result).toEqual([]);
  });
});
