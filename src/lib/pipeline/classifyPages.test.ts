import { describe, it, expect } from 'vitest';
import { classifyPages } from './classifyPages';
import { makeExistingPage, makeCrawledPage } from './testFixtures';
import { computeContentHash } from '@/lib/hash';

describe('classifyPages', () => {
  it('reuses the existing analysis when the content hash is unchanged', () => {
    const crawled = makeCrawledPage({ title: 'Fresh Title', description: 'Fresh description', mainContent: 'Fresh content' });
    const existing = makeExistingPage({
      contentHash: computeContentHash('Fresh Title', 'Fresh description', 'Fresh content'),
      category: 'Guides',
      description: 'Curated description',
      importanceScore: 77,
    });
    const existingByUrl = new Map([[crawled.url, existing]]);

    const { working } = classifyPages([crawled], existingByUrl, undefined);

    expect(working).toHaveLength(1);
    expect(working[0].reused).toBe(true);
    expect(working[0].manualEdit).toBe(false);
    expect(working[0].category).toBe('Guides');
    expect(working[0].description).toBe('Curated description');
    expect(working[0].importanceScore).toBe(77);
  });

  it('carries a reused page\'s already-verified markdownUrl from the DB, not the fresh crawl (which never re-verifies it)', () => {
    const crawled = makeCrawledPage({ title: 'Fresh Title', description: 'Fresh description', mainContent: 'Fresh content', markdownUrl: null });
    const existing = makeExistingPage({
      contentHash: computeContentHash('Fresh Title', 'Fresh description', 'Fresh content'),
      markdownUrl: 'https://example.com/docs/existing.md',
    });
    const existingByUrl = new Map([[crawled.url, existing]]);

    const { working } = classifyPages([crawled], existingByUrl, undefined);

    expect(working[0].reused).toBe(true);
    expect(working[0].markdownUrl).toBe('https://example.com/docs/existing.md');
  });

  it('leaves a freshly-classified page\'s markdownUrl null, pending PHASE 5b discovery', () => {
    const crawled = makeCrawledPage({ url: 'https://example.com/docs/new', declaredMarkdownAlternate: 'https://example.com/docs/new.md' });
    const { working } = classifyPages([crawled], new Map(), undefined);

    expect(working[0].reused).toBe(false);
    expect(working[0].markdownUrl).toBeNull();
    expect(working[0].declaredMarkdownAlternate).toBe('https://example.com/docs/new.md');
  });

  it('re-classifies fresh when content changed and the page was not manually edited', () => {
    const crawled = makeCrawledPage({ url: 'https://example.com/docs/x', title: 'Docs X' });
    const existing = makeExistingPage({ url: 'https://example.com/docs/x', contentHash: 'stale-hash', manualEdit: false, description: 'Old curated description' });
    const existingByUrl = new Map([[crawled.url, existing]]);

    const { working } = classifyPages([crawled], existingByUrl, undefined);

    expect(working[0].reused).toBe(false);
    expect(working[0].manualEdit).toBe(false);
    // Fresh classification uses the newly-scraped description, not the stale curated one.
    expect(working[0].description).toBe(crawled.description);
  });

  it('preserves a manually-edited page even when its content hash has changed (regression test)', () => {
    const crawled = makeCrawledPage({ url: 'https://example.com/docs/pinned', title: 'Pinned Page' });
    const existing = makeExistingPage({
      url: 'https://example.com/docs/pinned',
      contentHash: 'stale-hash', // deliberately different from what computeContentHash(crawled) would produce
      manualEdit: true,
      description: 'Hand-written description',
      included: false,
      excludeReason: 'removed-by-user',
    });
    const existingByUrl = new Map([[crawled.url, existing]]);

    const { working } = classifyPages([crawled], existingByUrl, undefined);

    expect(working[0].reused).toBe(false); // content did change...
    expect(working[0].manualEdit).toBe(true); // ...but curation is still preserved
    expect(working[0].description).toBe('Hand-written description');
    expect(working[0].included).toBe(false);
    expect(working[0].excludeReason).toBe('removed-by-user');
  });

  it('marks the homepage via reference equality to the provided homepage page', () => {
    const home = makeCrawledPage({ url: 'https://example.com/' });
    const other = makeCrawledPage({ url: 'https://example.com/docs' });
    const { working } = classifyPages([home, other], new Map(), home);

    expect(working.find((w) => w.url === home.url)?.isHome).toBe(true);
    expect(working.find((w) => w.url === other.url)?.isHome).toBe(false);
  });

  it('queues pages the deterministic classifier is not confident about for LLM review', () => {
    const ambiguous = makeCrawledPage({ url: 'https://example.com/page-42', title: 'Untitled', headings: [] });
    const confident = makeCrawledPage({ url: 'https://example.com/docs/setup', title: 'Setup' });

    const { ambiguousForLlm } = classifyPages([ambiguous, confident], new Map(), undefined);

    expect(ambiguousForLlm.map((p) => p.url)).toEqual([ambiguous.url]);
  });
});
