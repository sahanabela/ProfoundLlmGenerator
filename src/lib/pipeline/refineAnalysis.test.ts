import { describe, it, expect } from 'vitest';
import { fixGenericDescriptions, applyLlmResults, scoreImportance } from './refineAnalysis';
import type { WorkingPage } from './workingPage';
import type { LlmAnalysisResult } from '@/lib/analyzer/llm';

function makeWorking(overrides: Partial<WorkingPage> = {}): WorkingPage {
  return {
    url: 'https://example.com/a',
    canonicalUrl: null,
    markdownUrl: null,
    title: 'Page',
    description: 'A shared boilerplate description.',
    headings: [],
    contentExcerpt: '',
    contentHash: 'hash',
    category: 'Documentation',
    importanceScore: 0,
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

describe('fixGenericDescriptions', () => {
  it('replaces a description shared across most pages with that page\'s first paragraph', () => {
    const shared = 'Site-wide boilerplate description.';
    const working = [
      makeWorking({ url: 'https://example.com/a', description: shared }),
      makeWorking({ url: 'https://example.com/b', description: shared }),
      makeWorking({ url: 'https://example.com/c', description: shared }),
      makeWorking({ url: 'https://example.com/d', description: 'A genuinely unique description.' }),
    ];
    const firstParagraphByUrl = new Map([
      ['https://example.com/a', 'The real first paragraph of page a.'],
      ['https://example.com/b', 'The real first paragraph of page b.'],
      ['https://example.com/c', 'The real first paragraph of page c.'],
    ]);

    fixGenericDescriptions(working, firstParagraphByUrl);

    expect(working[0].description).toBe('The real first paragraph of page a.');
    expect(working[1].description).toBe('The real first paragraph of page b.');
    expect(working[2].description).toBe('The real first paragraph of page c.');
    expect(working[3].description).toBe('A genuinely unique description.'); // untouched — not generic
  });

  it('never touches a reused, manually-edited, or home page', () => {
    const shared = 'Site-wide boilerplate description.';
    const working = [
      makeWorking({ url: 'https://example.com/a', description: shared, reused: true }),
      makeWorking({ url: 'https://example.com/b', description: shared, manualEdit: true }),
      makeWorking({ url: 'https://example.com/c', description: shared, isHome: true }),
      makeWorking({ url: 'https://example.com/d', description: shared }),
      makeWorking({ url: 'https://example.com/e', description: shared }),
      makeWorking({ url: 'https://example.com/f', description: shared }),
    ];
    const firstParagraphByUrl = new Map(working.map((w) => [w.url, 'Some other real paragraph.']));

    fixGenericDescriptions(working, firstParagraphByUrl);

    expect(working[0].description).toBe(shared);
    expect(working[1].description).toBe(shared);
    expect(working[2].description).toBe(shared);
    expect(working[3].description).toBe('Some other real paragraph.');
  });

  it('falls back to an empty description when there is no usable first paragraph', () => {
    const shared = 'Site-wide boilerplate description.';
    const working = Array.from({ length: 4 }, (_, i) => makeWorking({ url: `https://example.com/${i}`, description: shared }));
    fixGenericDescriptions(working, new Map()); // no first paragraphs available
    expect(working.every((w) => w.description === '')).toBe(true);
  });
});

describe('applyLlmResults', () => {
  it('applies a matching LLM analysis to a page', () => {
    const working = [makeWorking({ url: 'https://example.com/a', category: 'Resources', description: 'old' })];
    const llmResults = new Map<string, LlmAnalysisResult>([
      ['https://example.com/a', { url: 'https://example.com/a', category: 'Guides', importance: 'high', description: 'llm description', include: true }],
    ]);

    applyLlmResults(working, llmResults);

    expect(working[0].category).toBe('Guides');
    expect(working[0].description).toBe('llm description');
    expect(working[0].analysisSource).toBe('llm');
    expect(working[0].included).toBe(true);
  });

  it('excludes a page the LLM says not to include', () => {
    const working = [makeWorking({ url: 'https://example.com/a', included: true })];
    const llmResults = new Map<string, LlmAnalysisResult>([
      ['https://example.com/a', { url: 'https://example.com/a', category: 'Blog', importance: 'low', description: 'thin', include: false }],
    ]);

    applyLlmResults(working, llmResults);

    expect(working[0].included).toBe(false);
    expect(working[0].excludeReason).toBe('llm-excluded');
  });

  it('leaves reused pages and pages with no LLM result untouched', () => {
    const reused = makeWorking({ url: 'https://example.com/a', reused: true, category: 'Documentation' });
    const noResult = makeWorking({ url: 'https://example.com/b', category: 'Documentation' });
    const working = [reused, noResult];

    applyLlmResults(working, new Map([['https://example.com/a', { url: 'https://example.com/a', category: 'Blog', importance: 'high', description: 'x', include: true }]]));

    expect(working[0].category).toBe('Documentation'); // reused, so untouched despite having a result
    expect(working[1].category).toBe('Documentation'); // no result for this url
  });
});

describe('scoreImportance', () => {
  it('recomputes importanceScore for freshly-analyzed pages', () => {
    const working = [makeWorking({ url: 'https://example.com/a', importanceScore: 0, category: 'Documentation', isHome: true })];
    scoreImportance(working, new Map());
    expect(working[0].importanceScore).toBeGreaterThan(0);
  });

  it('never recomputes importanceScore for a reused page', () => {
    const working = [makeWorking({ url: 'https://example.com/a', importanceScore: 999, reused: true })];
    scoreImportance(working, new Map());
    expect(working[0].importanceScore).toBe(999);
  });
});
