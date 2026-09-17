// Phase 1 (Discovery) + Phase 2 (Extraction) orchestrator. Combines sitemap
// discovery with breadth-first internal-link crawling, under bounded
// concurrency, respecting robots.txt.
//
// Markdown-alternate discovery (formerly done inline here as "Phase 3") is
// deferred until after curation — see pipeline/markdownAlternates.ts — so
// only pages that make the final cut pay for the verification requests.

import pLimit from 'p-limit';
import * as cheerio from 'cheerio';
import { safeFetch } from '@/lib/security/safeFetch';
import { fetchRobots, isAllowedByRobots, type RobotsRules } from './robots';
import { discoverSitemapUrls } from './sitemap';
import {
  normalizeUrl,
  normalizeOrigin,
  isSameSite,
  isBinaryOrAssetUrl,
  looksLikeAuthUrl,
  looksLikeUtilityUrl,
  looksLikePaginationUrl,
  looksLikeSearchUrl,
} from './normalizeUrl';
import { discoveryPriority } from './priority';
import { extractMainContent, looksLikeEmptyShell } from '@/lib/extractor/content';
import { extractMetadata } from '@/lib/extractor/metadata';
import { renderWithPlaywright } from './dynamicFallback';
import type { CrawledPage, CrawlLimits, ExclusionReason } from '@/types';

interface QueueItem {
  url: string;
  depth: number;
  priorityHint: number;
}

export interface PreExcludedUrl {
  url: string;
  reason: ExclusionReason;
  depth: number;
}

export interface FailedFetch {
  url: string;
  error: string;
  statusCode?: number;
}

export interface CrawlResult {
  crawledPages: CrawledPage[];
  failedFetches: FailedFetch[];
  preExcluded: PreExcludedUrl[];
  robots: RobotsRules;
  robotsBlockedSamples: string[];
  totalDiscovered: number;
  usedDynamicFallback: boolean;
}

export interface CrawlCallbacks {
  onProgress?: (info: { discovered: number; crawled: number; queueSize: number; currentBatch: string[] }) => void;
}

export async function crawlWebsite(startUrl: string, limits: CrawlLimits, callbacks: CrawlCallbacks = {}): Promise<CrawlResult> {
  const origin = normalizeOrigin(startUrl);
  if (!origin) throw new Error('Could not determine site origin from URL');

  const robots = await fetchRobots(origin, limits.requestTimeoutMs);

  const seen = new Set<string>(); // every normalized URL we've considered as a page candidate
  const visited = new Set<string>(); // URLs we've actually attempted to fetch
  const robotsBlockedSamples: string[] = [];
  const preExcluded: PreExcludedUrl[] = [];
  const failedFetches: FailedFetch[] = [];
  const crawledPages: CrawledPage[] = [];
  let usedDynamicFallback = false;

  let queue: QueueItem[] = [];

  function classifyAndMaybeQueue(rawUrl: string, base: string, depth: number, sitemapPriority?: number) {
    const normalized = normalizeUrl(rawUrl, base);
    if (!normalized) return; // unsupported scheme, mailto/tel/js — not a page at all
    if (!isSameSite(normalized, origin!)) return;
    if (isBinaryOrAssetUrl(normalized)) return; // asset, not a page — doesn't count toward discovered
    if (seen.has(normalized)) return;
    seen.add(normalized);

    let path: string;
    try {
      const u = new URL(normalized);
      path = u.pathname + u.search;
    } catch {
      return;
    }

    if (!isAllowedByRobots(path, robots)) {
      preExcluded.push({ url: normalized, reason: 'excluded-by-robots', depth });
      if (robotsBlockedSamples.length < 10) robotsBlockedSamples.push(path);
      return;
    }
    if (looksLikeAuthUrl(normalized)) {
      preExcluded.push({ url: normalized, reason: 'auth', depth });
      return;
    }
    if (looksLikeSearchUrl(normalized)) {
      preExcluded.push({ url: normalized, reason: 'search-results', depth });
      return;
    }
    if (looksLikePaginationUrl(normalized)) {
      preExcluded.push({ url: normalized, reason: 'pagination', depth });
      return;
    }
    if (looksLikeUtilityUrl(normalized)) {
      preExcluded.push({ url: normalized, reason: 'low-priority-utility', depth });
      return;
    }

    queue.push({ url: normalized, depth, priorityHint: discoveryPriority(normalized, depth, sitemapPriority) });
  }

  classifyAndMaybeQueue(origin, origin, 0);
  const sitemapUrls = await discoverSitemapUrls(origin, robots, limits.requestTimeoutMs);
  for (const s of sitemapUrls) classifyAndMaybeQueue(s.loc, origin, 0, s.priority);

  queue.sort((a, b) => b.priorityHint - a.priorityHint);

  const limit = pLimit(Math.max(1, limits.concurrency));

  while (queue.length && visited.size < limits.maxPages) {
    const batch: QueueItem[] = [];
    while (queue.length && batch.length < limits.concurrency && visited.size + batch.length < limits.maxPages) {
      const next = queue.shift()!;
      if (visited.has(next.url)) continue;
      batch.push(next);
    }
    if (batch.length === 0) break;

    batch.forEach((item) => visited.add(item.url));
    callbacks.onProgress?.({ discovered: seen.size, crawled: crawledPages.length, queueSize: queue.length, currentBatch: batch.map((b) => b.url) });

    const results = await Promise.all(
      batch.map((item) =>
        limit(async () => {
          const outcome = await fetchAndExtract(item.url, item.depth, limits);
          if (outcome.dynamicFallbackUsed) usedDynamicFallback = true;
          return { item, outcome };
        }),
      ),
    );

    for (const { item, outcome } of results) {
      if (!outcome.page) {
        failedFetches.push({ url: item.url, error: outcome.error ?? 'Unknown error', statusCode: outcome.statusCode });
        continue;
      }
      crawledPages.push(outcome.page);
      if (item.depth < limits.maxDepth) {
        for (const link of outcome.page.internalLinks) classifyAndMaybeQueue(link, item.url, item.depth + 1);
      }
    }
    queue.sort((a, b) => b.priorityHint - a.priorityHint);
  }

  return {
    crawledPages,
    failedFetches,
    preExcluded,
    robots,
    robotsBlockedSamples,
    totalDiscovered: seen.size,
    usedDynamicFallback,
  };
}

interface FetchOutcome {
  page: CrawledPage | null;
  error?: string;
  statusCode?: number;
  dynamicFallbackUsed?: boolean;
}

async function fetchAndExtract(url: string, depth: number, limits: CrawlLimits): Promise<FetchOutcome> {
  const res = await safeFetch(url, { timeoutMs: limits.requestTimeoutMs });

  if (!res.ok) {
    return { page: null, error: res.error ?? `HTTP ${res.status} ${res.statusText}`, statusCode: res.status || undefined };
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('html')) {
    return { page: null, error: `Unsupported content type: ${contentType || 'unknown'}`, statusCode: res.status };
  }

  let html = res.body;
  let { $, content } = extractMainContent(html);
  let dynamicFallbackUsed = false;

  if (looksLikeEmptyShell(content, html)) {
    const rendered = await renderWithPlaywright(res.finalUrl, limits.requestTimeoutMs);
    if (rendered) {
      dynamicFallbackUsed = true;
      html = rendered;
      const reExtracted = extractMainContent(html);
      $ = reExtracted.$;
      content = reExtracted.content;
    }
  }

  const metadata = extractMetadata($, res.finalUrl, content.firstParagraph, content.firstH1);

  const internalLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) internalLinks.push(href);
  });

  const page: CrawledPage = {
    url: res.finalUrl,
    canonicalUrl: metadata.canonicalUrl,
    // Deferred: PHASE 5b (pipeline/markdownAlternates.ts) verifies this only for pages that
    // survive curation, instead of every crawled page paying for up to 2 verification requests.
    markdownUrl: null,
    declaredMarkdownAlternate: metadata.markdownAlternateUrl,
    statusCode: res.status,
    contentType,
    title: metadata.title,
    description: metadata.description,
    firstParagraph: content.firstParagraph || null,
    siteName: metadata.siteName,
    headings: metadata.headings,
    mainContent: content.mainContent,
    wordCount: content.wordCount,
    internalLinks,
    depth,
  };

  return { page, dynamicFallbackUsed };
}
