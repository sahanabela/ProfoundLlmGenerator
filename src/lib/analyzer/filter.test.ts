import { describe, it, expect } from 'vitest';
import { applyContentFilters, type FilterCandidate } from './filter';

function page(overrides: Partial<FilterCandidate>): FilterCandidate {
  return { url: 'https://example.com/x', title: 'X', headings: [], wordCount: 200, contentHash: 'hash-x', importanceScore: 30, isHome: false, ...overrides };
}

describe('applyContentFilters', () => {
  it('excludes thin-content pages', () => {
    const result = applyContentFilters([page({ url: 'https://example.com/thin', wordCount: 10, contentHash: 'a' })]);
    expect(result.get('https://example.com/thin')).toBe('thin-content');
  });

  it('never excludes the homepage on content grounds', () => {
    const result = applyContentFilters([page({ url: 'https://example.com/', wordCount: 5, contentHash: 'a', isHome: true })]);
    expect(result.has('https://example.com/')).toBe(false);
  });

  it('detects duplicate content and keeps the highest-importance copy', () => {
    const pages: FilterCandidate[] = [
      page({ url: 'https://example.com/a', contentHash: 'same', importanceScore: 10 }),
      page({ url: 'https://example.com/b', contentHash: 'same', importanceScore: 50 }),
    ];
    const result = applyContentFilters(pages);
    expect(result.get('https://example.com/a')).toBe('duplicate');
    expect(result.has('https://example.com/b')).toBe(false);
  });

  it('excludes navigation-only pages by title', () => {
    const result = applyContentFilters([page({ url: 'https://example.com/sitemap-page', title: 'Full Sitemap', wordCount: 60, contentHash: 'nav' })]);
    expect(result.get('https://example.com/sitemap-page')).toBe('navigation');
  });

  it('does not exclude normal substantial pages', () => {
    const result = applyContentFilters([page({ url: 'https://example.com/docs/setup', wordCount: 500, contentHash: 'unique' })]);
    expect(result.has('https://example.com/docs/setup')).toBe(false);
  });
});
