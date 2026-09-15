'use client';

import { EXCLUSION_LABELS, type ExclusionReason, type ValidationResult } from '@/types';
import { formatRelativeTime } from '@/lib/format';

export interface GeneratedStats {
  discovered: number;
  crawled: number;
  included: number;
  excluded: number;
  failed: number;
  notReachedDueToBudget?: number;
  exclusionBreakdown: Partial<Record<ExclusionReason, number>>;
  sections: { name: string; count: number }[];
  validation: ValidationResult;
  usedDynamicFallback?: boolean;
  robotsBlockedSamples?: string[];
  added?: number;
  changed?: number;
  removed?: number;
}

export function WebsiteStats({ stats, lastCrawledAt }: { stats: GeneratedStats; lastCrawledAt: string | null }) {
  const breakdownEntries = Object.entries(stats.exclusionBreakdown).filter(([, count]) => (count ?? 0) > 0) as [ExclusionReason, number][];
  breakdownEntries.sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Discovered" value={stats.discovered} />
        <StatTile label="Included" value={stats.included} accent="moss" />
        <StatTile label="Excluded" value={stats.excluded} accent="accent" />
        <StatTile label="Failed" value={stats.failed} accent={stats.failed > 0 ? 'accent' : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-ink-950/45">
        <span>Last crawled {formatRelativeTime(lastCrawledAt)}</span>
        <ValidationBadge validation={stats.validation} />
        {stats.usedDynamicFallback && <span className="text-ink-950/40">· used headless rendering for JS-heavy pages</span>}
      </div>

      {breakdownEntries.length > 0 && (
        <div className="rounded-xl2 border border-ink-950/10 bg-white/60 p-5">
          <p className="text-sm text-ink-950">
            <strong className="font-display font-medium">{stats.excluded}</strong> pages excluded because they were:
          </p>
          <ul className="mt-3 space-y-1.5">
            {breakdownEntries.map(([reason, count]) => (
              <li key={reason} className="flex items-center justify-between text-sm text-ink-950/65">
                <span>{EXCLUSION_LABELS[reason] ?? reason}</span>
                <span className="font-mono text-xs text-ink-950/40">{count}</span>
              </li>
            ))}
          </ul>
          {!!stats.notReachedDueToBudget && (
            <p className="mt-3 text-xs text-ink-950/40">
              +{stats.notReachedDueToBudget} more pages were discovered but not reached within the crawl budget.
            </p>
          )}
        </div>
      )}

      {(stats.added || stats.changed || stats.removed) ? (
        <div className="flex gap-4 font-mono text-xs text-ink-950/50">
          {!!stats.added && <span className="text-moss">+{stats.added} added</span>}
          {!!stats.changed && <span className="text-accent">~{stats.changed} changed</span>}
          {!!stats.removed && <span className="text-ink-950/40">−{stats.removed} removed</span>}
        </div>
      ) : null}
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: 'moss' | 'accent' }) {
  const valueClass = accent === 'moss' ? 'text-moss' : accent === 'accent' ? 'text-accent' : 'text-ink-950';
  return (
    <div className="rounded-xl2 border border-ink-950/10 bg-white/60 px-4 py-3.5">
      <p className={`font-display text-2xl ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-950/45">{label}</p>
    </div>
  );
}

function ValidationBadge({ validation }: { validation: ValidationResult }) {
  if (!validation) return null;
  return (
    <span className={validation.valid ? 'text-moss' : 'text-red-600'}>
      {validation.valid ? '✓' : '✗'} {validation.valid ? 'Valid llms.txt' : 'Invalid llms.txt'} · {validation.linkCount} links · {validation.sectionCount} sections
    </span>
  );
}
