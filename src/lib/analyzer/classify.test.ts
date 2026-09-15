import { describe, it, expect } from 'vitest';
import { classifyDeterministic } from './classify';

describe('classifyDeterministic', () => {
  it('classifies by URL path first', () => {
    expect(classifyDeterministic({ url: 'https://example.com/docs/setup', title: '', headings: [] }).category).toBe('Documentation');
    expect(classifyDeterministic({ url: 'https://example.com/api/users', title: '', headings: [] }).category).toBe('API Reference');
    expect(classifyDeterministic({ url: 'https://example.com/guides/deploying', title: '', headings: [] }).category).toBe('Guides');
    expect(classifyDeterministic({ url: 'https://example.com/pricing', title: '', headings: [] }).category).toBe('Product');
    expect(classifyDeterministic({ url: 'https://example.com/blog/launch-week', title: '', headings: [] }).category).toBe('Blog');
  });

  it('marks path-rule matches as confident', () => {
    expect(classifyDeterministic({ url: 'https://example.com/docs', title: '', headings: [] }).confident).toBe(true);
  });

  it('falls back to keyword matching on title/headings when the path is ambiguous', () => {
    const result = classifyDeterministic({ url: 'https://example.com/page-42', title: 'Quickstart Guide', headings: [] });
    expect(result.category).toBe('Getting Started');
    expect(result.confident).toBe(true);
  });

  it('is unconfident (ambiguous) when nothing matches', () => {
    const result = classifyDeterministic({ url: 'https://example.com/page-42', title: 'Untitled', headings: [] });
    expect(result.confident).toBe(false);
  });
});
