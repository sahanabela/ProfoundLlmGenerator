// PHASE 4 (part 1): turns freshly-crawled pages into WorkingPage rows.
//
// For each page, either reuse its last analysis verbatim (content hash
// unchanged, or a person hand-curated it — see Page.manualEdit) or run the
// deterministic classifier fresh and queue it for optional LLM review if
// the classifier wasn't confident. Pure and synchronous: no DB or network
// calls happen here, which is what makes it unit-testable on its own.

import type { Page } from '@prisma/client';
import { classifyDeterministic } from '@/lib/analyzer/classify';
import { computeContentHash } from '@/lib/hash';
import type { CrawledPage, ExclusionReason } from '@/types';
import type { LlmPageInput } from '@/lib/analyzer/llm';
import type { WorkingPage } from './workingPage';

export interface ClassifyPagesResult {
  working: WorkingPage[];
  ambiguousForLlm: LlmPageInput[];
}

export function classifyPages(crawledPages: CrawledPage[], existingByUrl: Map<string, Page>, homepage: CrawledPage | undefined): ClassifyPagesResult {
  const working: WorkingPage[] = [];
  const ambiguousForLlm: LlmPageInput[] = [];

  for (const page of crawledPages) {
    const title = page.title ?? '';
    const description = page.description ?? '';
    const contentHash = computeContentHash(title, description, page.mainContent);
    const existing = existingByUrl.get(page.url);
    const isHome = page === homepage;
    const contentExcerpt = page.mainContent.slice(0, 800);
    const contentUnchanged = existing?.contentHash === contentHash;

    // A page a person has hand-curated in the Editable Preview
    // (description/section/included) keeps that curation on every future
    // crawl, even once the page's actual content changes — otherwise the
    // very next content tweak (a timestamp, an ad, a "related posts"
    // widget) would silently fall through to fresh automatic
    // classification and undo their edit with no indication it happened.
    if (existing && existing.analysisSource && (contentUnchanged || existing.manualEdit)) {
      working.push({
        url: page.url,
        canonicalUrl: page.canonicalUrl,
        markdownUrl: page.markdownUrl,
        title: existing.title || title,
        description: existing.description || description,
        headings: page.headings,
        contentExcerpt,
        contentHash,
        category: existing.category || 'Resources',
        importanceScore: existing.importanceScore,
        included: existing.included,
        excludeReason: (existing.excludeReason as ExclusionReason | null) ?? undefined,
        analysisSource: existing.analysisSource as 'deterministic' | 'llm',
        wordCount: page.wordCount,
        depth: page.depth,
        statusCode: page.statusCode,
        contentType: page.contentType,
        isHome,
        reused: contentUnchanged,
        manualEdit: existing.manualEdit,
      });
      continue;
    }

    const classification = classifyDeterministic({ url: page.url, title, headings: page.headings });
    working.push({
      url: page.url,
      canonicalUrl: page.canonicalUrl,
      markdownUrl: page.markdownUrl,
      title,
      description,
      headings: page.headings,
      contentExcerpt,
      contentHash,
      category: classification.category,
      importanceScore: 0,
      included: true,
      analysisSource: 'deterministic',
      wordCount: page.wordCount,
      depth: page.depth,
      statusCode: page.statusCode,
      contentType: page.contentType,
      isHome,
      reused: false,
      manualEdit: false,
    });

    if (!classification.confident) {
      ambiguousForLlm.push({ url: page.url, title, description, headings: page.headings, contentExcerpt });
    }
  }

  return { working, ambiguousForLlm };
}
