// The in-memory shape a page takes while runCrawlPipeline works through it —
// halfway between a freshly-crawled CrawledPage and a persisted Page row.
// Shared by every phase in this directory.

import type { ExclusionReason } from '@/types';

export interface WorkingPage {
  url: string;
  canonicalUrl: string | null;
  markdownUrl: string | null;
  title: string;
  description: string;
  headings: string[];
  contentExcerpt: string;
  contentHash: string;
  category: string;
  importanceScore: number;
  included: boolean;
  excludeReason?: ExclusionReason;
  analysisSource: 'deterministic' | 'llm';
  wordCount: number;
  depth: number;
  statusCode: number | null;
  contentType: string | null;
  isHome: boolean;
  /** True once this row was reused as-is because its content hash matched the last crawl exactly. */
  reused: boolean;
  /** True if a person edited this page's curation by hand — see the schema comment on Page.manualEdit. */
  manualEdit: boolean;
}

/** Applies an exclusion reason (from content filters, curation caps, etc) to every page it names. */
export function applyExclusionReasons(working: WorkingPage[], reasonByUrl: Map<string, ExclusionReason>): void {
  for (const w of working) {
    const reason = reasonByUrl.get(w.url);
    if (reason) {
      w.included = false;
      w.excludeReason = reason;
    }
  }
}
