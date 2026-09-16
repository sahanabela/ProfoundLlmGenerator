// Counts how many other pages in this same crawl link to each page — one of
// the importance-scoring signals (see analyzer/importance.ts).

import { normalizeUrl } from '@/lib/crawler/normalizeUrl';
import type { CrawledPage } from '@/types';

export function computeInboundLinkCounts(pages: CrawledPage[]): Map<string, number> {
  const crawledUrlSet = new Set(pages.map((p) => p.url));
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const rawLink of page.internalLinks) {
      const normalized = normalizeUrl(rawLink, page.url);
      if (!normalized || normalized === page.url || !crawledUrlSet.has(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return counts;
}
