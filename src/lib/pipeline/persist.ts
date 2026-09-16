// PHASE 8/9: writes this crawl's results to the database — the persisted
// Page rows, and the added/changed/removed ChangeEvents (with the "don't
// delete on one failed request" grace period applied along the way).

import type { Page } from '@prisma/client';
import { upsertPage, markPageMissing, markPageRemoved, createChangeEvents } from '@/lib/db/repository';
import type { PreExcludedUrl } from '@/lib/crawler/crawler';
import type { ChangeEventType } from '@/types';
import type { WorkingPage } from './workingPage';

export async function persistWorkingPages(websiteId: string, working: WorkingPage[], inboundCounts: Map<string, number>, now: Date): Promise<void> {
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
}

/** Pages excluded by URL shape alone (auth, tracking, robots, …) were never fetched, so this is a lighter upsert. */
export async function persistPreExcludedPages(websiteId: string, preExcluded: PreExcludedUrl[], now: Date): Promise<void> {
  for (const pe of preExcluded) {
    await upsertPage(websiteId, pe.url, {
      included: false,
      excludeReason: pe.reason,
      depth: pe.depth,
      lastSeenAt: now,
      missingSince: null,
      removedAt: null,
    }).catch(() => {});
  }
}

export interface ChangeEventInput {
  websiteId: string;
  crawlId: string;
  type: ChangeEventType;
  pageUrl: string;
  title?: string;
}

/**
 * Applies the missing-page grace period — a page absent from this crawl for
 * the second time running is marked removed; the first time just starts the
 * clock (see README > "How updates work") — and records added/changed/
 * removed ChangeEvents. Returns the events so the caller can total them up
 * for crawl stats without a second pass over the same data.
 */
export async function detectAndRecordChanges(
  websiteId: string,
  crawlId: string,
  existingPages: Page[],
  existingByUrl: Map<string, Page>,
  working: WorkingPage[],
  preExcluded: PreExcludedUrl[],
  now: Date,
): Promise<ChangeEventInput[]> {
  const seenThisCrawl = new Set([...working.map((w) => w.url), ...preExcluded.map((p) => p.url)]);
  const changeEvents: ChangeEventInput[] = [];

  for (const existing of existingPages) {
    if (seenThisCrawl.has(existing.url) || existing.removedAt) continue;
    if (existing.missingSince) {
      await markPageRemoved(existing.id, now);
      changeEvents.push({ websiteId, crawlId, type: 'removed', pageUrl: existing.url, title: existing.title ?? undefined });
    } else {
      await markPageMissing(existing.id, now);
    }
  }

  for (const w of working) {
    if (w.reused) continue;
    const existing = existingByUrl.get(w.url);
    if (!existing) {
      changeEvents.push({ websiteId, crawlId, type: 'added', pageUrl: w.url, title: w.title });
    } else if (existing.contentHash !== w.contentHash) {
      changeEvents.push({ websiteId, crawlId, type: 'changed', pageUrl: w.url, title: w.title });
    }
  }

  await createChangeEvents(changeEvents);
  return changeEvents;
}
