import { describe, it, expect } from 'vitest';
import { applyExclusionReasons, type WorkingPage } from './workingPage';

function makeWorking(overrides: Partial<WorkingPage> = {}): WorkingPage {
  return {
    url: 'https://example.com/a',
    canonicalUrl: null,
    markdownUrl: null,
    title: 'Page',
    description: '',
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

describe('applyExclusionReasons', () => {
  it('excludes only the pages named in the reason map', () => {
    const working = [makeWorking({ url: 'https://example.com/a' }), makeWorking({ url: 'https://example.com/b' })];
    applyExclusionReasons(working, new Map([['https://example.com/a', 'duplicate']]));

    expect(working[0].included).toBe(false);
    expect(working[0].excludeReason).toBe('duplicate');
    expect(working[1].included).toBe(true);
    expect(working[1].excludeReason).toBeUndefined();
  });

  it('does nothing when the reason map is empty', () => {
    const working = [makeWorking()];
    applyExclusionReasons(working, new Map());
    expect(working[0].included).toBe(true);
  });
});
