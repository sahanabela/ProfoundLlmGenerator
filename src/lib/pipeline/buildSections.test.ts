import { describe, it, expect } from 'vitest';
import { organizeWorkingPagesIntoSections } from './buildSections';
import { makeExistingPage } from './testFixtures';
import type { WorkingPage } from './workingPage';

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

describe('organizeWorkingPagesIntoSections', () => {
  it('groups included pages by category', () => {
    const working = [
      makeWorking({ url: 'https://example.com/docs/a', category: 'Documentation' }),
      makeWorking({ url: 'https://example.com/guide/a', category: 'Guides' }),
    ];
    const { sections } = organizeWorkingPagesIntoSections(working, new Map());
    expect(sections.map((s) => s.name).sort()).toEqual(['Documentation', 'Guides']);
  });

  it('excludes pages that are not included', () => {
    const working = [makeWorking({ url: 'https://example.com/docs/a', included: false })];
    const { sections } = organizeWorkingPagesIntoSections(working, new Map());
    expect(sections).toEqual([]);
  });

  it('excludes the homepage from every section', () => {
    const working = [makeWorking({ url: 'https://example.com/', isHome: true, importanceScore: 90 })];
    const { sections } = organizeWorkingPagesIntoSections(working, new Map());
    expect(sections).toEqual([]);
  });

  it('honors a manual sectionOverride pulled from the existing Page row', () => {
    const working = [makeWorking({ url: 'https://example.com/docs/a', category: 'Documentation' })];
    const existingByUrl = new Map([['https://example.com/docs/a', makeExistingPage({ sectionOverride: 'Custom Section' })]]);

    const { sections } = organizeWorkingPagesIntoSections(working, existingByUrl);

    expect(sections.map((s) => s.name)).toEqual(['Custom Section']);
  });
});
