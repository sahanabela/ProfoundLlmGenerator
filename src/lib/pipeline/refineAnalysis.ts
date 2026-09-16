// PHASE 4 (part 2): three small, independent refinements applied to
// freshly-classified WorkingPage rows, in order, before content filtering.
// Each only touches pages classifyPages() ran fresh this crawl — a reused or
// manually-edited page's curation is never revisited (see classifyPages.ts).

import { computeImportanceScore } from '@/lib/analyzer/importance';
import type { LlmAnalysisResult } from '@/lib/analyzer/llm';
import type { WorkingPage } from './workingPage';

function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Some sites reuse one site-wide <meta name="description"> on every page
 * (common on docs sites). If the same description shows up on a large share
 * of pages, it's boilerplate, not a per-page summary — prefer that page's
 * first paragraph instead so the file doesn't repeat one line over and over.
 */
export function fixGenericDescriptions(working: WorkingPage[], firstParagraphByUrl: Map<string, string | null>): void {
  const descriptionCounts = new Map<string, number>();
  for (const w of working) {
    if (!w.reused && !w.manualEdit && w.description) descriptionCounts.set(w.description, (descriptionCounts.get(w.description) ?? 0) + 1);
  }

  const genericThreshold = Math.max(3, Math.ceil(working.length * 0.3));

  for (const w of working) {
    if (w.reused || w.manualEdit || w.isHome) continue;
    if ((descriptionCounts.get(w.description) ?? 0) < genericThreshold) continue;
    const fallback = (firstParagraphByUrl.get(w.url) ?? '').trim();
    w.description = fallback && fallback !== w.description ? truncateAtWordBoundary(fallback, 180) : '';
  }
}

/** Merges validated LLM analysis (for pages the deterministic classifier flagged ambiguous) back into working. */
export function applyLlmResults(working: WorkingPage[], llmResults: Map<string, LlmAnalysisResult>): void {
  for (const w of working) {
    if (w.reused) continue;
    const llm = llmResults.get(w.url);
    if (!llm) continue;
    w.category = llm.category;
    w.description = llm.description || w.description;
    w.analysisSource = 'llm';
    if (!llm.include) {
      w.included = false;
      w.excludeReason = 'llm-excluded';
    }
  }
}

/** Recomputes importanceScore for every freshly-analyzed page (reused/manually-curated scores are left untouched). */
export function scoreImportance(working: WorkingPage[], inboundCounts: Map<string, number>): void {
  for (const w of working) {
    if (w.reused) continue;
    w.importanceScore = computeImportanceScore({
      isHome: w.isHome,
      category: w.category,
      depth: w.depth,
      wordCount: w.wordCount,
      inboundLinks: inboundCounts.get(w.url) ?? 0,
      hasMarkdownAlternate: Boolean(w.markdownUrl),
    });
  }
}
