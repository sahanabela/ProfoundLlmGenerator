import { describe, it, expect, vi, beforeEach } from 'vitest';

const discoverMarkdownUrlMock = vi.fn();
vi.mock('@/lib/extractor/markdownDiscovery', () => ({ discoverMarkdownUrl: (...args: unknown[]) => discoverMarkdownUrlMock(...args) }));

import { discoverMarkdownAlternatesForFinalPages } from './markdownAlternates';
import type { WorkingPage } from './workingPage';
import type { LlmsTxtSection } from '@/types';

function makeWorking(overrides: Partial<WorkingPage> = {}): WorkingPage {
  return {
    url: 'https://example.com/a',
    canonicalUrl: null,
    markdownUrl: null,
    declaredMarkdownAlternate: null,
    title: 'Page',
    description: 'A description.',
    headings: [],
    contentExcerpt: '',
    contentHash: 'hash',
    category: 'Documentation',
    importanceScore: 40,
    included: true,
    analysisSource: 'deterministic',
    wordCount: 300,
    depth: 1,
    statusCode: 200,
    contentType: 'text/html',
    isHome: false,
    reused: false,
    manualEdit: false,
    ...overrides,
  };
}

function makeSections(pages: { url: string; title?: string; description?: string }[]): LlmsTxtSection[] {
  return [{ name: 'Documentation', pages: pages.map((p) => ({ url: p.url, title: p.title ?? 'Page', description: p.description ?? 'Desc' })) }];
}

beforeEach(() => {
  discoverMarkdownUrlMock.mockReset();
});

describe('discoverMarkdownAlternatesForFinalPages', () => {
  it('verifies and applies a markdown alternate for a fresh page that made the final cut', async () => {
    const working = [makeWorking({ url: 'https://example.com/a', declaredMarkdownAlternate: 'https://example.com/a.md' })];
    const sections = makeSections([{ url: 'https://example.com/a' }]);
    discoverMarkdownUrlMock.mockResolvedValue('https://example.com/a.md');

    await discoverMarkdownAlternatesForFinalPages(sections, working, 10000);

    expect(discoverMarkdownUrlMock).toHaveBeenCalledWith('https://example.com/a', 'https://example.com/a.md', 10000);
    expect(working[0].markdownUrl).toBe('https://example.com/a.md');
    expect(sections[0].pages[0].url).toBe('https://example.com/a.md');
  });

  it('leaves the link untouched when no alternate is found', async () => {
    const working = [makeWorking({ url: 'https://example.com/a' })];
    const sections = makeSections([{ url: 'https://example.com/a' }]);
    discoverMarkdownUrlMock.mockResolvedValue(null);

    await discoverMarkdownAlternatesForFinalPages(sections, working, 10000);

    expect(working[0].markdownUrl).toBeNull();
    expect(sections[0].pages[0].url).toBe('https://example.com/a');
  });

  it('never re-verifies a reused page, even though it appears in the final sections', async () => {
    const working = [makeWorking({ url: 'https://example.com/a', reused: true, markdownUrl: 'https://example.com/a.md' })];
    const sections = makeSections([{ url: 'https://example.com/a.md' }]); // toLink already resolved to the stored markdownUrl

    await discoverMarkdownAlternatesForFinalPages(sections, working, 10000);

    expect(discoverMarkdownUrlMock).not.toHaveBeenCalled();
  });

  it('never re-verifies a manually-edited page', async () => {
    const working = [makeWorking({ url: 'https://example.com/a', manualEdit: true, markdownUrl: null })];
    const sections = makeSections([{ url: 'https://example.com/a' }]);

    await discoverMarkdownAlternatesForFinalPages(sections, working, 10000);

    expect(discoverMarkdownUrlMock).not.toHaveBeenCalled();
  });

  it('only verifies pages that actually appear in the final sections, ignoring curated-out pages', async () => {
    const working = [
      makeWorking({ url: 'https://example.com/kept' }),
      makeWorking({ url: 'https://example.com/curated-out' }), // not present in `sections` below
    ];
    const sections = makeSections([{ url: 'https://example.com/kept' }]);
    discoverMarkdownUrlMock.mockResolvedValue(null);

    await discoverMarkdownAlternatesForFinalPages(sections, working, 10000);

    expect(discoverMarkdownUrlMock).toHaveBeenCalledTimes(1);
    expect(discoverMarkdownUrlMock).toHaveBeenCalledWith('https://example.com/kept', null, 10000);
  });
});
