import { describe, it, expect } from 'vitest';
import { validateLlmsTxt } from './validateLlmsTxt';

describe('validateLlmsTxt', () => {
  it('accepts a well-formed file', () => {
    const result = validateLlmsTxt(`# Example

> A short summary.

## Documentation

- [Guide](https://example.com/guide): A helpful guide.
`);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags a missing H1', () => {
    const result = validateLlmsTxt(`## Documentation\n\n- [Guide](https://example.com/guide): A guide.\n`);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /H1/.test(i.message))).toBe(true);
  });

  it('flags more than one H1', () => {
    const result = validateLlmsTxt(`# One\n\n# Two\n\n## Docs\n\n- [A](https://example.com/a): a\n`);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /H1/.test(i.message))).toBe(true);
  });

  it('flags an H2 that appears before the H1', () => {
    const result = validateLlmsTxt(`## Docs\n\n- [A](https://example.com/a): a\n\n# Example\n`);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /before the H1/.test(i.message))).toBe(true);
  });

  it('flags an empty section', () => {
    const result = validateLlmsTxt(`# Example\n\n## Documentation\n\n## Guides\n\n- [A](https://example.com/a): a\n`);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /no links/.test(i.message))).toBe(true);
  });

  it('flags duplicate URLs', () => {
    const result = validateLlmsTxt(`# Example\n\n## Docs\n\n- [A](https://example.com/a): a\n- [A again](https://example.com/a): dup\n`);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /Duplicate URLs/.test(i.message))).toBe(true);
  });

  it('flags an invalid link URL', () => {
    const result = validateLlmsTxt(`# Example\n\n## Docs\n\n- [A](not-a-url): a\n`);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /Invalid link URL/.test(i.message))).toBe(true);
  });

  it('counts links and sections correctly', () => {
    const result = validateLlmsTxt(
      `# Example\n\n## Docs\n\n- [A](https://example.com/a): a\n- [B](https://example.com/b): b\n\n## Guides\n\n- [C](https://example.com/c): c\n`,
    );
    expect(result.linkCount).toBe(3);
    expect(result.sectionCount).toBe(2);
  });
});
