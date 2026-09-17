// PHASE 4 (optional layer): LLM-assisted classification for ambiguous pages.
//
// The app must work with zero LLM configuration — this module is only ever
// called for pages the deterministic classifier in classify.ts could not
// confidently categorize, and every result is validated against a strict
// zod schema before it's trusted. See README > "How Analysis Works".

import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';
import { z } from 'zod';
import { KNOWN_CATEGORIES } from './classify';

const AnalysisSchema = z.object({
  url: z.string(),
  category: z.enum(KNOWN_CATEGORIES),
  importance: z.enum(['high', 'medium', 'low']),
  description: z.string().min(1).max(240),
  include: z.boolean(),
});

export type LlmAnalysisResult = z.infer<typeof AnalysisSchema>;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 12;

export function isLlmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface LlmPageInput {
  url: string;
  title: string;
  description: string;
  headings: string[];
  contentExcerpt: string;
}

const TOOL_NAME = 'record_page_analyses';

const tool: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Record the category, importance, description, and inclusion decision for a batch of web pages.',
  input_schema: {
    type: 'object',
    properties: {
      analyses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The exact page URL as given in the input.' },
            category: { type: 'string', enum: [...KNOWN_CATEGORIES] },
            importance: { type: 'string', enum: ['high', 'medium', 'low'] },
            description: { type: 'string', description: 'One concise sentence (<=25 words) describing what an AI agent would find on this page.' },
            include: { type: 'boolean', description: 'Whether this page is valuable enough to list in a curated llms.txt for AI agents.' },
          },
          required: ['url', 'category', 'importance', 'description', 'include'],
        },
      },
    },
    required: ['analyses'],
  },
};

// Batches are fully independent requests, so they run concurrently rather than one-at-a-time —
// capped so a large site doesn't fire off dozens of Anthropic requests at once.
const BATCH_CONCURRENCY = 4;

/** Batches ambiguous pages to the LLM and returns validated results keyed by URL. Fails soft. */
export async function analyzePagesWithLlm(pages: LlmPageInput[]): Promise<Map<string, LlmAnalysisResult>> {
  const results = new Map<string, LlmAnalysisResult>();
  if (!isLlmConfigured() || pages.length === 0) return results;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const batches: LlmPageInput[][] = [];
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    batches.push(pages.slice(i, i + BATCH_SIZE));
  }

  const limit = pLimit(BATCH_CONCURRENCY);
  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        try {
          const message = await client.messages.create({
            model: MODEL,
            max_tokens: 4000,
            tools: [tool],
            tool_choice: { type: 'tool', name: TOOL_NAME },
            messages: [{ role: 'user', content: buildPrompt(batch) }],
          });

          const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
          if (!toolUse) return;

          const parsed = z.object({ analyses: z.array(AnalysisSchema) }).safeParse(toolUse.input);
          if (!parsed.success) return;

          for (const analysis of parsed.data.analyses) {
            if (batch.some((p) => p.url === analysis.url)) results.set(analysis.url, analysis);
          }
        } catch (err) {
          // Fail soft: this batch simply keeps its deterministic classification.
          console.error('[llm] analysis batch failed, falling back to deterministic rules:', err);
        }
      }),
    ),
  );

  return results;
}

function buildPrompt(pages: LlmPageInput[]): string {
  const entries = pages
    .map(
      (p, idx) => `### Page ${idx + 1}
URL: ${p.url}
Title: ${p.title || '(none)'}
Description: ${p.description || '(none)'}
Headings: ${p.headings.slice(0, 8).join(', ') || '(none)'}
Content excerpt:
${p.contentExcerpt.slice(0, 800) || '(empty)'}`,
    )
    .join('\n\n');

  return `You are helping curate a concise, high-signal llms.txt file for a website — a map of its most useful pages for AI agents, not an exhaustive sitemap.

For each page below, decide:
- category: the single best fit from ${KNOWN_CATEGORIES.join(', ')}
- importance: how central this page is to understanding or using the product/site
- description: one short, concrete sentence about what's on the page (not marketing fluff)
- include: false for thin, duplicate-feeling, purely promotional, or low-value utility pages; true otherwise

${entries}

Call ${TOOL_NAME} with one analysis per page, in the same order, using the exact URL given.`;
}
