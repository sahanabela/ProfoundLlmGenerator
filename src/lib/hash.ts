// Content hashing for change detection (PHASE 8/9).
//
// We hash normalized *meaningful* content — title + description + main
// content — rather than raw HTML, so timestamps, analytics IDs, ad slots,
// and other incidental markup churn don't trigger false "page changed"
// signals. See README > Tradeoffs.

import { createHash } from 'node:crypto';

export function normalizeForHashing(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeContentHash(title: string, description: string, mainContent: string): string {
  const normalized = [normalizeForHashing(title), normalizeForHashing(description), normalizeForHashing(mainContent)].join('\n---\n');
  return createHash('sha256').update(normalized).digest('hex');
}
