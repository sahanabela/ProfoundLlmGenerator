// Shared domain types used across the crawler, analyzer, and generator layers.

export type CrawlStage =
  | 'discovering'
  | 'crawling'
  | 'extracting'
  | 'analyzing'
  | 'organizing'
  | 'generating'
  | 'done';

export type CrawlStatus = 'pending' | 'running' | 'completed' | 'failed';

export type MonitoringFrequency = 'manual' | 'daily' | 'weekly';

/** A single URL discovered before it has been fetched/crawled. */
export interface DiscoveredUrl {
  url: string;
  source: 'sitemap' | 'link-crawl' | 'seed';
  depth: number;
  priorityHint: number;
}

/** Result of fetching + extracting a single page. */
export interface CrawledPage {
  url: string;
  canonicalUrl: string | null;
  markdownUrl: string | null;

  statusCode: number | null;
  contentType: string | null;
  ok: boolean;
  error?: string;

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

/** Deterministic or LLM analysis result for a page. */
export interface PageAnalysis {
  category: string;
  importance: 'high' | 'medium' | 'low';
  importanceScore: number;
  description: string;
  include: boolean;
  excludeReason?: ExclusionReason;
  source: 'deterministic' | 'llm';
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
  | 'fetch-failed'
  | 'non-html'
  | 'llm-excluded'
  | 'below-curation-threshold';

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
  'fetch-failed': 'pages that failed to load',
  'non-html': 'non-HTML resources',
  'llm-excluded': 'flagged as low-value by analysis',
  'below-curation-threshold': 'lower-priority pages trimmed to keep the file concise',
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
  concurrency: Number(process.env.CRAWL_CONCURRENCY ?? 5),
};

export const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3MB cap per response
