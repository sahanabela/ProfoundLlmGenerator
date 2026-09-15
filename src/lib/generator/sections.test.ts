import { describe, it, expect } from 'vitest';
import { organizeSections, MAX_PAGES_PER_SECTION, MAX_TOTAL_PAGES, type SectionCandidate } from './sections';

function candidate(overrides: Partial<SectionCandidate>): SectionCandidate {
  return { url: 'https://example.com/x', markdownUrl: null, title: 'X', description: '', category: 'Documentation', importanceScore: 40, isHome: false, ...overrides };
}

describe('organizeSections', () => {
  it('groups pages under their category as H2 sections', () => {
    const { sections } = organizeSections([
      candidate({ url: 'https://example.com/docs/a', category: 'Documentation' }),
      candidate({ url: 'https://example.com/guides/a', category: 'Guides' }),
    ]);
    expect(sections.map((s) => s.name).sort()).toEqual(['Documentation', 'Guides']);
  });

  it('excludes the homepage from section listings', () => {
    const { sections } = organizeSections([candidate({ url: 'https://example.com/', isHome: true, importanceScore: 90 })]);
    expect(sections).toEqual([]);
  });

  it('routes low-importance pages into "Optional"', () => {
    const { sections } = organizeSections([candidate({ url: 'https://example.com/misc', importanceScore: 5, category: 'Resources' })]);
    expect(sections.find((s) => s.name === 'Optional')).toBeTruthy();
  });

  it('never produces an empty section', () => {
    const { sections } = organizeSections([]);
    expect(sections.every((s) => s.pages.length > 0)).toBe(true);
    expect(sections).toEqual([]);
  });

  it('caps pages per primary section and overflows into Optional', () => {
    const many = Array.from({ length: MAX_PAGES_PER_SECTION + 5 }, (_, i) =>
      candidate({ url: `https://example.com/docs/${i}`, category: 'Documentation', importanceScore: 30 + i }),
    );
    const { sections } = organizeSections(many);
    const docsSection = sections.find((s) => s.name === 'Documentation')!;
    expect(docsSection.pages.length).toBe(MAX_PAGES_PER_SECTION);
    const optionalSection = sections.find((s) => s.name === 'Optional');
    expect(optionalSection?.pages.length).toBeGreaterThan(0);
  });

  it('never exceeds the total page cap across all sections', () => {
    const many = Array.from({ length: MAX_TOTAL_PAGES + 30 }, (_, i) =>
      candidate({ url: `https://example.com/docs/${i}`, category: 'Documentation', importanceScore: 100 - i }),
    );
    const { sections, curatedOut } = organizeSections(many);
    const total = sections.reduce((sum, s) => sum + s.pages.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_PAGES);
    expect(curatedOut.size).toBeGreaterThan(0);
  });

  it('prefers the markdown URL when available', () => {
    const { sections } = organizeSections([candidate({ url: 'https://example.com/docs/a', markdownUrl: 'https://example.com/docs/a.md' })]);
    expect(sections[0].pages[0].url).toBe('https://example.com/docs/a.md');
  });
});
