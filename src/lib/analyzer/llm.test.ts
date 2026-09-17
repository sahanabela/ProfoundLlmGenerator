import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) };
  },
}));

import { analyzePagesWithLlm, isLlmConfigured, type LlmPageInput } from './llm';

function makePage(url: string): LlmPageInput {
  return { url, title: 'Title', description: 'Description', headings: ['Heading'], contentExcerpt: 'Some content.' };
}

function toolResultFor(pages: LlmPageInput[]) {
  return {
    content: [
      {
        type: 'tool_use',
        input: {
          analyses: pages.map((p) => ({ url: p.url, category: 'Documentation', importance: 'medium', description: 'A description.', include: true })),
        },
      },
    ],
  };
}

describe('isLlmConfigured', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('is false with no API key and true once one is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isLlmConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    expect(isLlmConfigured()).toBe(true);
  });
});

describe('analyzePagesWithLlm', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('returns an empty map with no API key configured, without calling the SDK', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const results = await analyzePagesWithLlm([makePage('https://example.com/a')]);
    expect(results.size).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('merges results from multiple independent batches, dispatched concurrently', async () => {
    // 13 pages -> batch size 12 means 2 batches; each resolves in reverse order to prove
    // they were fired together rather than awaited one at a time.
    const pages = Array.from({ length: 13 }, (_, i) => makePage(`https://example.com/${i}`));
    let resolveFirst!: (v: unknown) => void;
    const firstBatchPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    createMock.mockImplementationOnce(() => firstBatchPromise); // batch 1 (12 pages) hangs until we resolve it
    createMock.mockImplementationOnce(async () => toolResultFor(pages.slice(12))); // batch 2 (1 page) resolves immediately

    const resultPromise = analyzePagesWithLlm(pages);
    // Give the second (faster) batch a tick to resolve while the first is still pending —
    // proves both requests were in flight at once, not sequential.
    await Promise.resolve().then(() => Promise.resolve());
    resolveFirst(toolResultFor(pages.slice(0, 12)));

    const results = await resultPromise;
    expect(results.size).toBe(13);
    expect(results.get('https://example.com/12')?.category).toBe('Documentation');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('fails soft on a batch error, keeping other batches\' results', async () => {
    const pages = [makePage('https://example.com/ok'), makePage('https://example.com/also-ok')];
    createMock.mockRejectedValueOnce(new Error('API error'));

    const results = await analyzePagesWithLlm(pages);
    expect(results.size).toBe(0); // the one batch failed, nothing to merge — but it must not throw
  });
});
