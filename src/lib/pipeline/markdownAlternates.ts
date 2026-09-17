// PHASE 5b: markdown-alternate discovery, deferred until after curation.
//
// Verifying a candidate .md URL costs up to 2 network requests per page (see
// extractor/markdownDiscovery.ts). Running that for every crawled page is
// wasteful — a meaningful share of them get dropped by content filters or
// section curation caps before ever reaching the output. So instead this
// runs only against the pages that actually survived into the final
// sections, after `organizeWorkingPagesIntoSections` has already decided
// who those are.
//
// Reused and manually-edited pages are skipped entirely: they already carry
// a verified markdownUrl from a previous crawl (see classifyPages.ts), so
// there's nothing to (re-)discover.

import pLimit from 'p-limit';
import { discoverMarkdownUrl } from '@/lib/extractor/markdownDiscovery';
import type { LlmsTxtSection } from '@/types';
import type { WorkingPage } from './workingPage';

const DISCOVERY_CONCURRENCY = 8;

export async function discoverMarkdownAlternatesForFinalPages(
  sections: LlmsTxtSection[],
  working: WorkingPage[],
  requestTimeoutMs: number,
): Promise<void> {
  const workingByUrl = new Map(working.map((w) => [w.url, w]));
  const limit = pLimit(DISCOVERY_CONCURRENCY);

  const tasks: Promise<void>[] = [];
  for (const section of sections) {
    for (const link of section.pages) {
      const w = workingByUrl.get(link.url);
      // Skip anything not fresh, or already resolved (link.url would no longer equal the
      // plain page url once toLink() had a markdownUrl to prefer).
      if (!w || w.reused || w.manualEdit || w.markdownUrl) continue;

      tasks.push(
        limit(async () => {
          const found = await discoverMarkdownUrl(w.url, w.declaredMarkdownAlternate, requestTimeoutMs);
          if (found) {
            w.markdownUrl = found;
            link.url = found;
          }
        }),
      );
    }
  }

  await Promise.all(tasks);
}
