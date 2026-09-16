// Small shared helper for the crawl-report / generated-file stats blob.

import type { ExclusionReason } from '@/types';

export function tallyExclusionReasons(reasons: ExclusionReason[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const reason of reasons) breakdown[reason] = (breakdown[reason] ?? 0) + 1;
  return breakdown;
}
