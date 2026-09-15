// PHASE 6: llms.txt Generation.
//
// Deterministic rendering only — we never ask an LLM to free-form the file.
// A structured LlmsTxtDoc is built first (see types/index.ts), then rendered.

import type { LlmsTxtDoc } from '@/types';

export function renderLlmsTxt(doc: LlmsTxtDoc): string {
  const lines: string[] = [];

  lines.push(`# ${doc.siteName.trim()}`);
  lines.push('');

  if (doc.summary?.trim()) {
    lines.push(`> ${doc.summary.trim()}`);
    lines.push('');
  }

  if (doc.details?.trim()) {
    lines.push(doc.details.trim());
    lines.push('');
  }

  for (const section of doc.sections) {
    if (section.pages.length === 0) continue;
    lines.push(`## ${section.name}`);
    lines.push('');
    for (const link of section.pages) {
      const description = link.description?.trim() ? `: ${link.description.trim()}` : '';
      lines.push(`- [${link.title.trim()}](${link.url})${description}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
