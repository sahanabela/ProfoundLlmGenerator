import { describe, it, expect } from 'vitest';
import { computeImportanceScore, importanceBand } from './importance';

describe('computeImportanceScore', () => {
  it('scores the homepage highly', () => {
    const home = computeImportanceScore({ isHome: true, category: 'Product', depth: 0, wordCount: 400, inboundLinks: 0, hasMarkdownAlternate: false });
    const deep = computeImportanceScore({ isHome: false, category: 'Product', depth: 4, wordCount: 400, inboundLinks: 0, hasMarkdownAlternate: false });
    expect(home).toBeGreaterThan(deep);
  });

  it('ranks Documentation/API/Getting Started above Company/Blog', () => {
    const docs = computeImportanceScore({ isHome: false, category: 'Documentation', depth: 1, wordCount: 400, inboundLinks: 0, hasMarkdownAlternate: false });
    const company = computeImportanceScore({ isHome: false, category: 'Company', depth: 1, wordCount: 400, inboundLinks: 0, hasMarkdownAlternate: false });
    expect(docs).toBeGreaterThan(company);
  });

  it('penalizes thin content', () => {
    const thin = computeImportanceScore({ isHome: false, category: 'Guides', depth: 1, wordCount: 20, inboundLinks: 0, hasMarkdownAlternate: false });
    const substantial = computeImportanceScore({ isHome: false, category: 'Guides', depth: 1, wordCount: 500, inboundLinks: 0, hasMarkdownAlternate: false });
    expect(thin).toBeLessThan(substantial);
  });

  it('rewards pages linked from many other pages', () => {
    const low = computeImportanceScore({ isHome: false, category: 'Guides', depth: 1, wordCount: 300, inboundLinks: 0, hasMarkdownAlternate: false });
    const high = computeImportanceScore({ isHome: false, category: 'Guides', depth: 1, wordCount: 300, inboundLinks: 15, hasMarkdownAlternate: false });
    expect(high).toBeGreaterThan(low);
  });

  it('never returns a negative score', () => {
    const score = computeImportanceScore({ isHome: false, category: 'Unknown', depth: 10, wordCount: 0, inboundLinks: 0, hasMarkdownAlternate: false });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('importanceBand', () => {
  it('buckets scores into high/medium/low', () => {
    expect(importanceBand(80)).toBe('high');
    expect(importanceBand(30)).toBe('medium');
    expect(importanceBand(5)).toBe('low');
  });
});
