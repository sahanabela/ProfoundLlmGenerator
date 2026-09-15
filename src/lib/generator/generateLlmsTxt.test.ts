import { describe, it, expect } from 'vitest';
import { renderLlmsTxt } from './generateLlmsTxt';
import { validateLlmsTxt } from './validateLlmsTxt';
import type { LlmsTxtDoc } from '@/types';

const doc: LlmsTxtDoc = {
  siteName: 'Example',
  summary: 'Example is a developer platform for building applications.',
  sections: [
    {
      name: 'Getting Started',
      pages: [
        { title: 'Quickstart', url: 'https://example.com/quickstart', description: 'Build your first app.' },
        { title: 'Installation', url: 'https://example.com/install' },
      ],
    },
    { name: 'Optional', pages: [{ title: 'Changelog', url: 'https://example.com/changelog', description: 'Release history.' }] },
  ],
};

describe('renderLlmsTxt', () => {
  it('starts with a single H1 site title', () => {
    const output = renderLlmsTxt(doc);
    expect(output.startsWith('# Example\n')).toBe(true);
  });

  it('includes the blockquote summary right after the H1', () => {
    const output = renderLlmsTxt(doc);
    expect(output).toContain('> Example is a developer platform for building applications.');
  });

  it('renders link items in the "- [Title](url): description" form', () => {
    const output = renderLlmsTxt(doc);
    expect(output).toContain('- [Quickstart](https://example.com/quickstart): Build your first app.');
  });

  it('omits the trailing colon when there is no description', () => {
    const output = renderLlmsTxt(doc);
    expect(output).toContain('- [Installation](https://example.com/install)\n');
    expect(output).not.toContain('- [Installation](https://example.com/install):');
  });

  it('skips sections with no pages', () => {
    const output = renderLlmsTxt({ ...doc, sections: [...doc.sections, { name: 'Empty', pages: [] }] });
    expect(output).not.toContain('## Empty');
  });

  it('produces output that passes the validator', () => {
    const output = renderLlmsTxt(doc);
    const result = validateLlmsTxt(output);
    expect(result.valid).toBe(true);
    expect(result.linkCount).toBe(3);
    expect(result.sectionCount).toBe(2);
  });
});
