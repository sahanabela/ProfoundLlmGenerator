// PHASE 4: content-based filtering that can only run after a page has been
// fetched (duplicate content, thin content, navigation-only pages). URL-shape
// exclusions (auth, tracking, pagination, robots) already happened at
// discovery time — see crawler/crawler.ts.

import type { ExclusionReason } from '@/types';

export const THIN_CONTENT_WORD_THRESHOLD = 50;

export interface FilterCandidate {
  url: string;
  title: string;
  headings: string[];
  wordCount: number;
  contentHash: string;
  importanceScore: number;
  isHome: boolean;
}

const NAVIGATION_TITLE_PATTERN = /\b(sitemap|site ?map|table of contents|all (articles|pages|posts)|archive index)\b/i;

/**
 * Given all successfully-crawled candidates for a site, returns a map of
 * url -> exclusion reason for ones that fail content-quality checks.
 * Candidates not present in the returned map pass these filters.
 */
export function applyContentFilters(pages: FilterCandidate[]): Map<string, ExclusionReason> {
  const excluded = new Map<string, ExclusionReason>();

  // Duplicate detection: identical normalized content hash -> keep the most
  // important copy, exclude the rest.
  const byHash = new Map<string, FilterCandidate[]>();
  for (const page of pages) {
    if (!page.contentHash) continue;
    const group = byHash.get(page.contentHash) ?? [];
    group.push(page);
    byHash.set(page.contentHash, group);
  }
  for (const group of byHash.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => b.importanceScore - a.importanceScore || a.url.length - b.url.length);
    for (const dupe of sorted.slice(1)) excluded.set(dupe.url, 'duplicate');
  }

  for (const page of pages) {
    if (excluded.has(page.url)) continue;
    if (page.isHome) continue; // never exclude the homepage on content grounds

    if (page.wordCount < THIN_CONTENT_WORD_THRESHOLD) {
      excluded.set(page.url, 'thin-content');
      continue;
    }

    if (NAVIGATION_TITLE_PATTERN.test(page.title) && page.wordCount < 150) {
      excluded.set(page.url, 'navigation');
      continue;
    }
  }

  return excluded;
}
