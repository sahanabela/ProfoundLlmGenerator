// The orchestrator: wires discovery -> extraction -> analysis -> section
// organization -> generation -> persistence together, updating a Crawl row's
// stage as it goes so the UI can poll for live progress (see PHASE 9 /
// "Background Jobs" in the spec — logically async stages, run in-process).
//
// This file is deliberately thin — it fetches data, calls one named phase
// function per step (each in its own sibling file, most of them pure and
// independently unit-tested), and handles the DB bookkeeping between phases.
// See pipeline.test.ts for the phase-level tests.

import { crawlWebsite } from '@/lib/crawler/crawler';
import { normalizeOrigin } from '@/lib/crawler/normalizeUrl';
import { isLlmConfigured, analyzePagesWithLlm } from '@/lib/analyzer/llm';
import { renderLlmsTxt } from '@/lib/generator/generateLlmsTxt';
import { validateLlmsTxt } from '@/lib/generator/validateLlmsTxt';
import { deriveSiteMetadata } from '@/lib/generator/siteMetadata';
import { fetchExistingLlmsTxt } from '@/lib/generator/existingLlmsTxt';
import { groupPagesBySection, buildCandidatesFromStoredPages } from '@/lib/generator/editorSections';
import { toLink } from '@/lib/generator/sections';
import { computeNextRunAt } from '@/lib/monitoring/scheduler';
import { DEFAULT_CRAWL_LIMITS, type ExclusionReason, type LlmsTxtDoc, type MonitoringFrequency } from '@/types';
import {
  getWebsite,
  createCrawl,
  updateCrawl,
  getPagesForWebsite,
  createGeneratedFile,
  getLatestGeneratedFile,
  touchWebsiteAfterCrawl,
  markPageCuratedOut,
} from '@/lib/db/repository';

import { computeInboundLinkCounts } from './inboundLinks';
import { classifyPages } from './classifyPages';
import { fixGenericDescriptions, applyLlmResults, scoreImportance } from './refineAnalysis';
import { applyExclusionReasons } from './workingPage';
import { organizeWorkingPagesIntoSections } from './buildSections';
import { persistWorkingPages, persistPreExcludedPages, detectAndRecordChanges } from './persist';
import { tallyExclusionReasons } from './stats';
import { applyContentFilters, type FilterCandidate } from '@/lib/analyzer/filter';

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

    // --- PHASE 4: analysis ---------------------------------------------
    const { working, ambiguousForLlm } = classifyPages(crawlResult.crawledPages, existingByUrl, homepage);

    const firstParagraphByUrl = new Map(crawlResult.crawledPages.map((p) => [p.url, p.firstParagraph]));
    fixGenericDescriptions(working, firstParagraphByUrl);

    const llmResults = ambiguousForLlm.length && isLlmConfigured() ? await analyzePagesWithLlm(ambiguousForLlm) : new Map();
    applyLlmResults(working, llmResults);

    scoreImportance(working, inboundCounts);

    const filterCandidates: FilterCandidate[] = working
      .filter((w) => w.included)
      .map((w) => ({ url: w.url, title: w.title, headings: w.headings, wordCount: w.wordCount, contentHash: w.contentHash, importanceScore: w.importanceScore, isHome: w.isHome }));
    applyExclusionReasons(working, applyContentFilters(filterCandidates));

    // --- PHASE 5: section organization ----------------------------------
    await updateCrawl(crawl.id, { stage: 'organizing', stageDetail: 'Grouping pages into sections…' });

    const { sections, curatedOut } = organizeWorkingPagesIntoSections(working, existingByUrl);
    applyExclusionReasons(working, curatedOut);

    // --- PHASE 8/9: persistence + change detection ----------------------
    const now = new Date();
    await persistWorkingPages(websiteId, working, inboundCounts, now);
    await persistPreExcludedPages(websiteId, crawlResult.preExcluded, now);
    const changeEvents = await detectAndRecordChanges(websiteId, crawl.id, existingPages, existingByUrl, working, crawlResult.preExcluded, now);

    // --- PHASE 6/7: generation + validation ------------------------------
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
    const excludedReasons: ExclusionReason[] = [
      ...working
        .filter((w) => !w.included)
        .map((w) => w.excludeReason)
        .filter((reason): reason is ExclusionReason => Boolean(reason)),
      ...crawlResult.preExcluded.map((p) => p.reason),
    ];
    const exclusionBreakdown = tallyExclusionReasons(excludedReasons);

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

    const nextScheduledCrawlAt = computeNextRunAt(website.monitoringFrequency as MonitoringFrequency, now);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateCrawl(crawl.id, { status: 'failed', error: message, finishedAt: new Date() }).catch(() => {});
    throw err;
  }
}

/**
 * Rebuilds llms.txt purely from what's currently in the Page table — no
 * crawling. Used by the "Editable Preview": once a person has moved pages
 * between sections, edited descriptions, or removed/re-added pages, this
 * regenerates a new GeneratedFile version from that edited state.
 */
export async function regenerateFromStoredPages(websiteId: string) {
  const website = await getWebsite(websiteId);
  if (!website) throw new Error('Website not found');

  const allPages = await getPagesForWebsite(websiteId);
  const candidates = buildCandidatesFromStoredPages(
    allPages.filter((p) => p.included),
    website.normalizedUrl,
  );

  const { groups, curatedOut } = groupPagesBySection(candidates);
  const sections = groups.map((g) => ({ name: g.name, pages: g.pages.map(toLink) }));

  // A regenerate can newly curate-out a page (e.g. re-adding one that no
  // longer fits its section's cap) — keep the DB in sync with what's shown.
  if (curatedOut.size > 0) {
    await Promise.all(candidates.filter((c) => curatedOut.has(c.url)).map((c) => markPageCuratedOut(c.id, curatedOut.get(c.url)!)));
  }

  const includedPages = candidates.filter((c) => !curatedOut.has(c.url));

  const derived = deriveSiteMetadata({ origin: website.normalizedUrl, homepage: null });
  const doc: LlmsTxtDoc = {
    siteName: website.siteName || derived.siteName,
    summary: website.siteDescription || derived.siteDescription,
    sections,
  };
  const content = renderLlmsTxt(doc);
  const validation = validateLlmsTxt(content);

  const excludedReasons: ExclusionReason[] = [
    ...allPages.filter((p) => !p.included).map((p) => (p.excludeReason as ExclusionReason) || 'removed-by-user'),
    ...curatedOut.values(),
  ];
  const exclusionBreakdown = tallyExclusionReasons(excludedReasons);

  const previousStats = (await getLatestGeneratedFile(websiteId))?.stats;
  const previous = previousStats ? JSON.parse(previousStats) : {};

  const stats = {
    discovered: previous.discovered ?? allPages.length,
    crawled: previous.crawled ?? allPages.length,
    included: includedPages.length,
    excluded: excludedReasons.length,
    failed: previous.failed ?? 0,
    notReachedDueToBudget: previous.notReachedDueToBudget ?? 0,
    exclusionBreakdown,
    sections: sections.map((s) => ({ name: s.name, count: s.pages.length })),
    validation,
    usedDynamicFallback: previous.usedDynamicFallback ?? false,
    robotsBlockedSamples: previous.robotsBlockedSamples ?? [],
    added: 0,
    changed: 0,
    removed: 0,
    editedManually: true,
  };

  const file = await createGeneratedFile(websiteId, content, stats);
  return { content, stats, validation, version: file.version, createdAt: file.createdAt };
}
