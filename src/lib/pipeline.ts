// The orchestrator: wires discovery -> extraction -> analysis -> section
// organization -> generation -> persistence together, updating a Crawl row's
// stage as it goes so the UI can poll for live progress (see PHASE 9 /
// "Background Jobs" in the spec — logically async stages, run in-process).

import { crawlWebsite } from '@/lib/crawler/crawler';
import { normalizeUrl, normalizeOrigin } from '@/lib/crawler/normalizeUrl';
import { classifyDeterministic } from '@/lib/analyzer/classify';
import { computeImportanceScore } from '@/lib/analyzer/importance';
import { applyContentFilters, type FilterCandidate } from '@/lib/analyzer/filter';
import { analyzePagesWithLlm, isLlmConfigured, type LlmPageInput } from '@/lib/analyzer/llm';
import { organizeSections, type SectionCandidate } from '@/lib/generator/sections';
import { renderLlmsTxt } from '@/lib/generator/generateLlmsTxt';
import { validateLlmsTxt } from '@/lib/generator/validateLlmsTxt';
import { deriveSiteMetadata } from '@/lib/generator/siteMetadata';
import { fetchExistingLlmsTxt } from '@/lib/generator/existingLlmsTxt';
import { computeContentHash } from '@/lib/hash';
import { computeNextRunAt } from '@/lib/monitoring/scheduler';
import { DEFAULT_CRAWL_LIMITS, type CrawledPage, type ExclusionReason, type LlmsTxtDoc } from '@/types';
import {
  getWebsite,
  createCrawl,
  updateCrawl,
  getPagesForWebsite,
  upsertPage,
  markPageMissing,
  markPageRemoved,
  createGeneratedFile,
  createChangeEvents,
  touchWebsiteAfterCrawl,
} from '@/lib/db/repository';

interface WorkingPage {
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
  reused: boolean;
}

function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

function computeInboundLinkCounts(pages: CrawledPage[]): Map<string, number> {
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

export async function runCrawlPipeline(websiteId: string, trigger: 'manual' | 'scheduled' = 'manual') {
  const website = await getWebsite(websiteId);
  if (!website) throw new Error('Website not found');

  const crawl = await createCrawl(websiteId, trigger);
  const limits = DEFAULT_CRAWL_LIMITS;

  try {
    await updateCrawl(crawl.id, { status: 'running', stage: 'discovering', stageDetail: 'Checking robots.txt and sitemap…' });

    let announcedCrawling = false;
    const crawlResult = await crawlWebsite(website.baseUrl, limits, {
      onProgress: ({ discovered, crawled, queueSize }) => {
        const stage = announcedCrawling ? undefined : 'crawling';
        announcedCrawling = true;
        updateCrawl(crawl.id, {
          ...(stage ? { stage } : {}),
          pagesDiscovered: discovered,
          pagesCrawled: crawled,
          stageDetail: `${crawled} pages crawled so far, ${queueSize} queued`,
        }).catch(() => {});
      },
    });

    await updateCrawl(crawl.id, {
      stage: 'extracting',
      pagesDiscovered: crawlResult.totalDiscovered,
      pagesCrawled: crawlResult.crawledPages.length,
      pagesFailed: crawlResult.failedFetches.length,
      stageDetail: `Extracted content from ${crawlResult.crawledPages.length} pages`,
    });

    const existingLlmsTxtContent = website.existingLlmsTxtCheckedAt
      ? website.existingLlmsTxtContent
      : await fetchExistingLlmsTxt(website.normalizedUrl, limits.requestTimeoutMs).catch(() => null);

    await updateCrawl(crawl.id, { stage: 'analyzing', stageDetail: 'Classifying pages and scoring importance…' });

    const origin = website.normalizedUrl;
    const homepage =
      crawlResult.crawledPages.find((p) => {
        try {
          return normalizeOrigin(p.url) === origin && new URL(p.url).pathname === '/';
        } catch {
          return false;
        }
      }) ?? crawlResult.crawledPages[0];

    const inboundCounts = computeInboundLinkCounts(crawlResult.crawledPages);
    const existingPages = await getPagesForWebsite(websiteId);
    const existingByUrl = new Map(existingPages.map((p) => [p.url, p]));

    const working: WorkingPage[] = [];
    const ambiguousForLlm: LlmPageInput[] = [];

    for (const page of crawlResult.crawledPages) {
      const title = page.title ?? '';
      const description = page.description ?? '';
      const contentHash = computeContentHash(title, description, page.mainContent);
      const existing = existingByUrl.get(page.url);
      const isHome = page === homepage;
      const contentExcerpt = page.mainContent.slice(0, 800);

      if (existing && existing.contentHash === contentHash && existing.analysisSource) {
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
          reused: true,
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
      });

      if (!classification.confident) {
        ambiguousForLlm.push({ url: page.url, title, description, headings: page.headings, contentExcerpt });
      }
    }

    // Some sites reuse one site-wide <meta name="description"> on every page
    // (common on docs sites). If the same description shows up on a large
    // share of pages, it's boilerplate, not a per-page summary — prefer that
    // page's first paragraph instead so the file doesn't repeat one line.
    const descriptionCounts = new Map<string, number>();
    for (const w of working) {
      if (!w.reused && w.description) descriptionCounts.set(w.description, (descriptionCounts.get(w.description) ?? 0) + 1);
    }
    const genericThreshold = Math.max(3, Math.ceil(working.length * 0.3));
    const firstParagraphByUrl = new Map(crawlResult.crawledPages.map((p) => [p.url, p.firstParagraph]));
    for (const w of working) {
      if (w.reused || w.isHome) continue;
      if ((descriptionCounts.get(w.description) ?? 0) < genericThreshold) continue;
      const fallback = (firstParagraphByUrl.get(w.url) ?? '').trim();
      w.description = fallback && fallback !== w.description ? truncateAtWordBoundary(fallback, 180) : '';
    }

    const llmResults = ambiguousForLlm.length && isLlmConfigured() ? await analyzePagesWithLlm(ambiguousForLlm) : new Map();

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

    const filterCandidates: FilterCandidate[] = working
      .filter((w) => w.included)
      .map((w) => ({ url: w.url, title: w.title, headings: w.headings, wordCount: w.wordCount, contentHash: w.contentHash, importanceScore: w.importanceScore, isHome: w.isHome }));
    const contentExclusions = applyContentFilters(filterCandidates);
    for (const w of working) {
      const reason = contentExclusions.get(w.url);
      if (reason) {
        w.included = false;
        w.excludeReason = reason;
      }
    }

    await updateCrawl(crawl.id, { stage: 'organizing', stageDetail: 'Grouping pages into sections…' });

    const sectionCandidates: SectionCandidate[] = working
      .filter((w) => w.included)
      .map((w) => ({ url: w.url, markdownUrl: w.markdownUrl, title: w.title, description: w.description, category: w.category, importanceScore: w.importanceScore, isHome: w.isHome }));
    const { sections, curatedOut } = organizeSections(sectionCandidates);
    for (const w of working) {
      const reason = curatedOut.get(w.url);
      if (reason) {
        w.included = false;
        w.excludeReason = reason;
      }
    }

    const now = new Date();
    for (const w of working) {
      await upsertPage(websiteId, w.url, {
        canonicalUrl: w.canonicalUrl,
        markdownUrl: w.markdownUrl,
        title: w.title,
        description: w.description,
        headings: JSON.stringify(w.headings),
        contentExcerpt: w.contentExcerpt,
        contentHash: w.contentHash,
        category: w.category,
        importanceScore: w.importanceScore,
        included: w.included,
        excludeReason: w.excludeReason ?? null,
        analysisSource: w.analysisSource,
        wordCount: w.wordCount,
        depth: w.depth,
        statusCode: w.statusCode,
        contentType: w.contentType,
        inboundLinks: inboundCounts.get(w.url) ?? 0,
        lastSeenAt: now,
        missingSince: null,
        removedAt: null,
      });
    }

    for (const pe of crawlResult.preExcluded) {
      await upsertPage(websiteId, pe.url, {
        included: false,
        excludeReason: pe.reason,
        depth: pe.depth,
        lastSeenAt: now,
        missingSince: null,
        removedAt: null,
      }).catch(() => {});
    }

    // Pages that existed before this crawl but weren't seen at all this time
    // (not even pre-excluded) get a grace period rather than instant removal.
    const seenThisCrawl = new Set([...working.map((w) => w.url), ...crawlResult.preExcluded.map((p) => p.url)]);
    const changeEvents: { websiteId: string; crawlId: string; type: string; pageUrl: string; title?: string }[] = [];

    for (const existing of existingPages) {
      if (seenThisCrawl.has(existing.url) || existing.removedAt) continue;
      if (existing.missingSince) {
        await markPageRemoved(existing.id, now);
        changeEvents.push({ websiteId, crawlId: crawl.id, type: 'removed', pageUrl: existing.url, title: existing.title ?? undefined });
      } else {
        await markPageMissing(existing.id, now);
      }
    }

    for (const w of working) {
      if (w.reused) continue;
      const existing = existingByUrl.get(w.url);
      if (!existing) {
        changeEvents.push({ websiteId, crawlId: crawl.id, type: 'added', pageUrl: w.url, title: w.title });
      } else if (existing.contentHash !== w.contentHash) {
        changeEvents.push({ websiteId, crawlId: crawl.id, type: 'changed', pageUrl: w.url, title: w.title });
      }
    }
    await createChangeEvents(changeEvents);

    await updateCrawl(crawl.id, { stage: 'generating', stageDetail: 'Rendering llms.txt…' });

    const derived = deriveSiteMetadata({
      origin: website.normalizedUrl,
      homepage: homepage ? { siteName: homepage.siteName, title: homepage.title, description: homepage.description } : null,
    });
    const doc: LlmsTxtDoc = {
      siteName: website.siteName || derived.siteName,
      summary: website.siteDescription || derived.siteDescription,
      sections,
    };
    const content = renderLlmsTxt(doc);
    const validation = validateLlmsTxt(content);

    const includedCount = working.filter((w) => w.included).length;
    const excludedReasons: ExclusionReason[] = [...working.filter((w) => !w.included).map((w) => w.excludeReason!).filter(Boolean), ...crawlResult.preExcluded.map((p) => p.reason)];
    const exclusionBreakdown: Record<string, number> = {};
    for (const reason of excludedReasons) exclusionBreakdown[reason] = (exclusionBreakdown[reason] ?? 0) + 1;

    const notReachedDueToBudget = Math.max(
      0,
      crawlResult.totalDiscovered - crawlResult.preExcluded.length - crawlResult.crawledPages.length - crawlResult.failedFetches.length,
    );

    const stats = {
      discovered: crawlResult.totalDiscovered,
      crawled: crawlResult.crawledPages.length,
      included: includedCount,
      excluded: excludedReasons.length,
      failed: crawlResult.failedFetches.length,
      notReachedDueToBudget,
      exclusionBreakdown,
      sections: sections.map((s) => ({ name: s.name, count: s.pages.length })),
      validation,
      usedDynamicFallback: crawlResult.usedDynamicFallback,
      robotsBlockedSamples: crawlResult.robotsBlockedSamples,
      added: changeEvents.filter((e) => e.type === 'added').length,
      changed: changeEvents.filter((e) => e.type === 'changed').length,
      removed: changeEvents.filter((e) => e.type === 'removed').length,
    };

    await createGeneratedFile(websiteId, content, stats);

    const nextScheduledCrawlAt = computeNextRunAt(website.monitoringFrequency as any, now);
    await touchWebsiteAfterCrawl(websiteId, {
      siteName: doc.siteName,
      siteDescription: doc.summary,
      lastCrawledAt: now,
      nextScheduledCrawlAt: website.monitoringEnabled ? nextScheduledCrawlAt : null,
      robotsDisallowedPaths: JSON.stringify(crawlResult.robotsBlockedSamples),
      ...(website.existingLlmsTxtCheckedAt ? {} : { existingLlmsTxtContent, existingLlmsTxtCheckedAt: now }),
    });

    await updateCrawl(crawl.id, {
      status: 'completed',
      stage: 'done',
      stageDetail: 'Done',
      finishedAt: now,
      pagesDiscovered: crawlResult.totalDiscovered,
      pagesCrawled: crawlResult.crawledPages.length,
      pagesIncluded: includedCount,
      pagesExcluded: excludedReasons.length,
      pagesFailed: crawlResult.failedFetches.length,
      exclusionBreakdown: JSON.stringify(exclusionBreakdown),
    });

    return { crawlId: crawl.id, content, stats, validation, existingLlmsTxtContent };
  } catch (err: any) {
    await updateCrawl(crawl.id, { status: 'failed', error: err?.message ?? String(err), finishedAt: new Date() }).catch(() => {});
    throw err;
  }
}
