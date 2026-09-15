import { describe, it, expect } from 'vitest';
import { diffCrawls } from './diff';

describe('diffCrawls', () => {
  it('detects added pages', () => {
    const result = diffCrawls([], [{ url: 'https://example.com/new', contentHash: 'a' }]);
    expect(result.added).toEqual(['https://example.com/new']);
  });

  it('detects changed pages by content hash', () => {
    const result = diffCrawls([{ url: 'https://example.com/docs', contentHash: 'old' }], [{ url: 'https://example.com/docs', contentHash: 'new' }]);
    expect(result.changed).toEqual(['https://example.com/docs']);
  });

  it('detects unchanged pages', () => {
    const result = diffCrawls([{ url: 'https://example.com/docs', contentHash: 'same' }], [{ url: 'https://example.com/docs', contentHash: 'same' }]);
    expect(result.unchanged).toEqual(['https://example.com/docs']);
  });

  it('detects pages missing from the current crawl', () => {
    const result = diffCrawls([{ url: 'https://example.com/gone', contentHash: 'a' }], []);
    expect(result.missingThisCrawl).toEqual(['https://example.com/gone']);
  });

  it('handles a mixed diff correctly', () => {
    const previous = [
      { url: 'https://example.com/a', contentHash: '1' },
      { url: 'https://example.com/b', contentHash: '2' },
      { url: 'https://example.com/c', contentHash: '3' },
    ];
    const current = [
      { url: 'https://example.com/a', contentHash: '1' }, // unchanged
      { url: 'https://example.com/b', contentHash: '2-updated' }, // changed
      { url: 'https://example.com/d', contentHash: '4' }, // added
      // 'c' missing
    ];
    const result = diffCrawls(previous, current);
    expect(result.unchanged).toEqual(['https://example.com/a']);
    expect(result.changed).toEqual(['https://example.com/b']);
    expect(result.added).toEqual(['https://example.com/d']);
    expect(result.missingThisCrawl).toEqual(['https://example.com/c']);
  });
});
