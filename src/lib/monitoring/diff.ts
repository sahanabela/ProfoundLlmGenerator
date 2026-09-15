// PHASE 9: pure change-detection logic between two crawls' worth of pages.
// The "don't delete on one failed request" grace period is a stateful
// concern handled by the pipeline (missingSince), not this pure function.

export interface PreviousPageRecord {
  url: string;
  contentHash: string | null;
}

export interface CurrentPageRecord {
  url: string;
  contentHash: string;
}

export interface CrawlDiff {
  added: string[];
  changed: string[];
  unchanged: string[];
  missingThisCrawl: string[]; // seen before, not seen this time (may or may not be truly gone)
}

export function diffCrawls(previous: PreviousPageRecord[], current: CurrentPageRecord[]): CrawlDiff {
  const previousByUrl = new Map(previous.map((p) => [p.url, p.contentHash]));
  const currentUrls = new Set(current.map((c) => c.url));

  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const page of current) {
    if (!previousByUrl.has(page.url)) {
      added.push(page.url);
    } else if (previousByUrl.get(page.url) !== page.contentHash) {
      changed.push(page.url);
    } else {
      unchanged.push(page.url);
    }
  }

  const missingThisCrawl = previous.filter((p) => !currentUrls.has(p.url)).map((p) => p.url);

  return { added, changed, unchanged, missingThisCrawl };
}
