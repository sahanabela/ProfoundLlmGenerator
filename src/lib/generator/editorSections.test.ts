import { describe, it, expect } from 'vitest';
import { groupPagesBySection, orderSectionNames, type EditableSectionCandidate } from './editorSections';
import { MAX_PAGES_PER_SECTION, MAX_OPTIONAL_SECTION } from './sections';

function candidate(overrides: Partial<EditableSectionCandidate>): EditableSectionCandidate {
  return {
    url: 'https://example.com/x',
    markdownUrl: null,
    title: 'X',
    description: '',
    category: 'Documentation',
    importanceScore: 40,
    isHome: false,
    sectionOverride: null,
    ...overrides,
  };
}

describe('orderSectionNames', () => {
  it('orders known categories in their canonical order', () => {
    expect(orderSectionNames(['Blog', 'Getting Started', 'Documentation'])).toEqual(['Getting Started', 'Documentation', 'Blog']);
  });

  it('places custom section names alphabetically after known categories, Optional last', () => {
    expect(orderSectionNames(['Optional', 'Documentation', 'Zeta', 'Alpha'])).toEqual(['Documentation', 'Alpha', 'Zeta', 'Optional']);
  });
});

describe('groupPagesBySection', () => {
  it('groups pages with no override under their auto-curated section', () => {
    const { groups } = groupPagesBySection([
      candidate({ url: 'https://example.com/docs/a', category: 'Documentation' }),
      candidate({ url: 'https://example.com/guide/a', category: 'Guides' }),
    ]);
    expect(groups.map((g) => g.name).sort()).toEqual(['Documentation', 'Guides']);
  });

  it('places a manually-overridden page directly into its chosen section, bypassing the per-section cap', () => {
    const auto = Array.from({ length: MAX_PAGES_PER_SECTION }, (_, i) =>
      candidate({ url: `https://example.com/docs/${i}`, category: 'Documentation', importanceScore: 50 + i }),
    );
    const manual = candidate({ url: 'https://example.com/pinned', category: 'Blog', importanceScore: 5, sectionOverride: 'Documentation' });
    const { groups } = groupPagesBySection([...auto, manual]);
    const docs = groups.find((g) => g.name === 'Documentation')!;
    // 8 auto pages (at the cap) + the manually pinned one, even though it's low-importance.
    expect(docs.pages.length).toBe(MAX_PAGES_PER_SECTION + 1);
    expect(docs.pages.some((p) => p.url === 'https://example.com/pinned')).toBe(true);
  });

  it('creates a brand-new section name from a sectionOverride that matches no known category', () => {
    const { groups } = groupPagesBySection([candidate({ url: 'https://example.com/x', sectionOverride: 'Tutorials' })]);
    expect(groups.map((g) => g.name)).toEqual(['Tutorials']);
  });

  it('excludes the homepage from every section', () => {
    const { groups } = groupPagesBySection([candidate({ url: 'https://example.com/', isHome: true, importanceScore: 90 })]);
    expect(groups).toEqual([]);
  });

  it('reports curatedOut once a section overflows past both the section cap and the Optional overflow cap', () => {
    // First MAX_PAGES_PER_SECTION stay in Documentation, the next MAX_OPTIONAL_SECTION
    // overflow into Optional, and anything beyond that has nowhere left to go.
    const total = MAX_PAGES_PER_SECTION + MAX_OPTIONAL_SECTION + 3;
    const many = Array.from({ length: total }, (_, i) =>
      candidate({ url: `https://example.com/docs/${i}`, category: 'Documentation', importanceScore: total - i }),
    );
    const { curatedOut } = groupPagesBySection(many);
    expect(curatedOut.size).toBeGreaterThan(0);
  });

  it('sorts a merged section (auto + manual) by importance score', () => {
    const auto = candidate({ url: 'https://example.com/auto', category: 'Blog', importanceScore: 10 });
    const manual = candidate({ url: 'https://example.com/manual', category: 'Documentation', importanceScore: 99, sectionOverride: 'Blog' });
    const { groups } = groupPagesBySection([auto, manual]);
    const blog = groups.find((g) => g.name === 'Blog')!;
    expect(blog.pages[0].url).toBe('https://example.com/manual');
  });
});
