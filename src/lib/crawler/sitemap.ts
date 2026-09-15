// Sitemap discovery + parsing, including sitemap-index support.

import { XMLParser } from 'fast-xml-parser';
import { safeFetch } from '@/lib/security/safeFetch';
import type { RobotsRules } from './robots';

const COMMON_LOCATIONS = ['/sitemap.xml', '/sitemap_index.xml'];
const MAX_SITEMAPS_TO_FOLLOW = 10;
const MAX_URLS_FROM_SITEMAP = 2000;

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  priority?: number;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export async function discoverSitemapUrls(origin: string, robots: RobotsRules, timeoutMs: number): Promise<SitemapUrl[]> {
  const candidates = [...robots.sitemaps, ...COMMON_LOCATIONS.map((p) => new URL(p, origin).toString())];
  const seen = new Set<string>();
  const results: SitemapUrl[] = [];
  let sitemapsFollowed = 0;

  const queue = [...new Set(candidates)];

  while (queue.length && sitemapsFollowed < MAX_SITEMAPS_TO_FOLLOW && results.length < MAX_URLS_FROM_SITEMAP) {
    const sitemapUrl = queue.shift()!;
    if (seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);

    const res = await safeFetch(sitemapUrl, { timeoutMs });
    if (!res.ok || !res.body) continue;
    sitemapsFollowed++;

    const parsed = safeParseXml(res.body);
    if (!parsed) continue;

    if (parsed.sitemapindex) {
      const entries = toArray(parsed.sitemapindex.sitemap);
      for (const entry of entries) {
        const loc = entry?.loc;
        if (typeof loc === 'string' && !seen.has(loc)) queue.push(loc);
      }
      continue;
    }

    if (parsed.urlset) {
      const entries = toArray(parsed.urlset.url);
      for (const entry of entries) {
        const loc = entry?.loc;
        if (typeof loc !== 'string') continue;
        results.push({
          loc,
          lastmod: typeof entry.lastmod === 'string' ? entry.lastmod : undefined,
          priority: entry.priority !== undefined ? Number(entry.priority) : undefined,
        });
        if (results.length >= MAX_URLS_FROM_SITEMAP) break;
      }
    }
  }

  return results;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function safeParseXml(xml: string): any | null {
  try {
    return parser.parse(xml);
  } catch {
    return null;
  }
}
