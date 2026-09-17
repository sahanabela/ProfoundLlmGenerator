// Shared domain types used across the crawler, analyzer, and generator layers.

export type MonitoringFrequency = 'manual' | 'daily' | 'weekly';

export type ChangeEventType = 'added' | 'changed' | 'removed';

/**
 * Result of successfully fetching + extracting a single page. A fetch that
 * fails or returns a non-HTML response never becomes a CrawledPage — see
 * FailedFetch in lib/crawler/crawler.ts instead.
 */
export interface CrawledPage {
  url: string;
  canonicalUrl: string | null;
  /** Always null straight out of the crawler — verifying a markdown alternate costs a network
   *  request, so it's deferred until after curation (see pipeline/markdownAlternates.ts) and only
   *  done for the pages that actually make the final cut. */
  markdownUrl: string | null;
  /** The page's own declared `<link rel="alternate" type="text/markdown">` href, unverified.
   *  Free to extract from the page's own HTML, so it's captured at crawl time regardless. */
  declaredMarkdownAlternate: string | null;

  statusCode: number | null;
  contentType: string | null;

  title: string | null;
  description: string | null;
  firstParagraph: string | null;
  siteName: string | null;
  headings: string[];
  mainContent: string;
  wordCount: number;

  internalLinks: string[];
  depth: number;
}

export type ExclusionReason =
  | 'duplicate'
  | 'auth'
  | 'thin-content'
  | 'navigation'
  | 'tracking'
  | 'pagination'
  | 'search-results'
  | 'low-priority-utility'
  | 'excluded-by-robots'
  | 'llm-excluded'
  | 'below-curation-threshold'
  | 'removed-by-user';

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  duplicate: 'duplicate pages',
  auth: 'login/authentication pages',
  'thin-content': 'low-content pages',
  navigation: 'navigation pages',
  tracking: 'tracking URLs',
  pagination: 'repetitive pagination pages',
  'search-results': 'search result pages',
  'low-priority-utility': 'utility pages (cart, legal, etc.)',
  'excluded-by-robots': 'blocked by robots.txt',
  'llm-excluded': 'flagged as low-value by analysis',
  'below-curation-threshold': 'lower-priority pages trimmed to keep the file concise',
  'removed-by-user': 'removed manually in the editor',
};

/** Structured intermediate representation rendered into llms.txt Markdown. */
export interface LlmsTxtDoc {
  siteName: string;
  summary?: string;
  details?: string;
  sections: LlmsTxtSection[];
}

export interface LlmsTxtSection {
  name: string;
  pages: LlmsTxtLink[];
}

export interface LlmsTxtLink {
  title: string;
  url: string;
  description?: string;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  linkCount: number;
  sectionCount: number;
}

export interface CrawlLimits {
  maxPages: number;
  maxDepth: number;
  requestTimeoutMs: number;
  concurrency: number;
}

export const DEFAULT_CRAWL_LIMITS: CrawlLimits = {
  maxPages: Number(process.env.CRAWL_MAX_PAGES ?? 100),
  maxDepth: Number(process.env.CRAWL_MAX_DEPTH ?? 5),
  requestTimeoutMs: Number(process.env.CRAWL_REQUEST_TIMEOUT_MS ?? 10000),
  // 8 is a reasonable default for most sites' capacity; raise it via env for a site you know
  // can take more load, or lower it to be gentler on a small/shared host.
  concurrency: Number(process.env.CRAWL_CONCURRENCY ?? 8),
};

export const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3MB cap per response
