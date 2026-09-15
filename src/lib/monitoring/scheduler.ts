// PHASE 9: a deliberately simple scheduler abstraction.
//
// `LocalPollingScheduler` is a stand-in for a real job queue (cron, SQS,
// Temporal, etc). It polls the database on an interval and re-crawls any
// website whose `nextScheduledCrawlAt` is due. Swapping it out later means
// implementing the same `Scheduler` interface against a real scheduler and
// calling the same `runDueCrawls()` function.

import type { MonitoringFrequency } from '@/types';
import { findWebsitesDueForCrawl } from '@/lib/db/repository';
import { runCrawlPipeline } from '@/lib/pipeline';

export interface Scheduler {
  start(): void;
  stop(): void;
}

const FREQUENCY_MS: Record<Exclude<MonitoringFrequency, 'manual'>, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export function computeNextRunAt(frequency: MonitoringFrequency, from: Date = new Date()): Date | null {
  if (frequency === 'manual') return null;
  return new Date(from.getTime() + FREQUENCY_MS[frequency]);
}

/** Finds every website whose scheduled crawl is due and re-crawls it, one at a time. */
export async function runDueCrawls(): Promise<{ websiteId: string; ok: boolean; error?: string }[]> {
  const due = await findWebsitesDueForCrawl(new Date());
  const results: { websiteId: string; ok: boolean; error?: string }[] = [];

  for (const website of due) {
    try {
      await runCrawlPipeline(website.id, 'scheduled');
      results.push({ websiteId: website.id, ok: true });
    } catch (err: any) {
      results.push({ websiteId: website.id, ok: false, error: err?.message ?? String(err) });
    }
  }

  return results;
}

export class LocalPollingScheduler implements Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private pollIntervalMs = 5 * 60 * 1000) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      runDueCrawls().catch((err) => console.error('[scheduler] runDueCrawls failed:', err));
    }, this.pollIntervalMs);
    // Fire an initial check immediately rather than waiting a full interval.
    runDueCrawls().catch((err) => console.error('[scheduler] runDueCrawls failed:', err));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
