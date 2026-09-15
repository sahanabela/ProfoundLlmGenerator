import { describe, it, expect } from 'vitest';
import { computeContentHash } from './hash';

describe('computeContentHash', () => {
  it('is stable for identical content', () => {
    const a = computeContentHash('Title', 'Description', 'Some content here.');
    const b = computeContentHash('Title', 'Description', 'Some content here.');
    expect(a).toBe(b);
  });

  it('is insensitive to whitespace differences', () => {
    const a = computeContentHash('Title', 'Description', 'Some   content\nhere.');
    const b = computeContentHash('Title', 'Description', 'Some content here.');
    expect(a).toBe(b);
  });

  it('is insensitive to case', () => {
    const a = computeContentHash('Title', 'Description', 'Some Content Here.');
    const b = computeContentHash('title', 'description', 'some content here.');
    expect(a).toBe(b);
  });

  it('changes when the meaningful content changes', () => {
    const a = computeContentHash('Title', 'Description', 'Version one of the content.');
    const b = computeContentHash('Title', 'Description', 'Version two of the content.');
    expect(a).not.toBe(b);
  });

  it('produces a 64-char hex sha256 digest', () => {
    const hash = computeContentHash('Title', 'Description', 'Content');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
