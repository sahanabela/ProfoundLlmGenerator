import { describe, it, expect } from 'vitest';
import { computeInboundLinkCounts } from './inboundLinks';
import { makeCrawledPage } from './testFixtures';

describe('computeInboundLinkCounts', () => {
  it('counts internal links from other crawled pages', () => {
    const a = makeCrawledPage({ url: 'https://example.com/a', internalLinks: ['/b', '/b', '/c'] });
    const b = makeCrawledPage({ url: 'https://example.com/b', internalLinks: ['/c'] });
    const c = makeCrawledPage({ url: 'https://example.com/c', internalLinks: [] });

    const counts = computeInboundLinkCounts([a, b, c]);

    expect(counts.get('https://example.com/b')).toBe(2);
    expect(counts.get('https://example.com/c')).toBe(2);
    expect(counts.get('https://example.com/a')).toBeUndefined();
  });

  it('ignores self-links and links to pages outside this crawl', () => {
    const a = makeCrawledPage({ url: 'https://example.com/a', internalLinks: ['/a', 'https://example.com/never-crawled'] });
    const counts = computeInboundLinkCounts([a]);
    expect(counts.size).toBe(0);
  });
});
