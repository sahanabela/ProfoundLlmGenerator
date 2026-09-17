// Shared fixture builders for the pipeline phase tests — not a test file
// itself (vitest only picks up *.test.ts).

import type { Page } from '@prisma/client';
import type { CrawledPage } from '@/types';

export function makeExistingPage(overrides: Partial<Page> = {}): Page {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'page_1',
    websiteId: 'site_1',
    url: 'https://example.com/docs/existing',
    canonicalUrl: null,
    markdownUrl: null,
    title: 'Existing Page',
    description: 'An existing page description.',
    headings: '[]',
    contentExcerpt: null,
    contentHash: 'existing-hash',
    category: 'Documentation',
    importanceScore: 40,
    included: true,
    excludeReason: null,
    sectionOverride: null,
    manualEdit: false,
    analysisSource: 'deterministic',
    wordCount: 300,
    depth: 1,
    statusCode: 200,
    contentType: 'text/html',
    inboundLinks: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    missingSince: null,
    removedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeCrawledPage(overrides: Partial<CrawledPage> = {}): CrawledPage {
  return {
    url: 'https://example.com/docs/existing',
    canonicalUrl: null,
    markdownUrl: null,
    declaredMarkdownAlternate: null,
    statusCode: 200,
    contentType: 'text/html',
    title: 'Fresh Title',
    description: 'A fresh page description.',
    firstParagraph: 'This is the first real paragraph of the page.',
    siteName: null,
    headings: ['Fresh Title'],
    mainContent: 'Fresh main content body text.',
    wordCount: 300,
    internalLinks: [],
    depth: 1,
    ...overrides,
  };
}
