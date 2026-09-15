'use client';

import { useState } from 'react';
import { formatFutureTime } from '@/lib/format';
import type { MonitoringFrequency } from '@/types';

export function MonitoringToggle({
  websiteId,
  enabled,
  frequency,
  nextScheduledCrawlAt,
  onChanged,
}: {
  websiteId: string;
  enabled: boolean;
  frequency: MonitoringFrequency;
  nextScheduledCrawlAt: string | null;
  onChanged: (data: { monitoringEnabled: boolean; monitoringFrequency: MonitoringFrequency; nextScheduledCrawlAt: string | null }) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function update(nextEnabled: boolean, nextFrequency: MonitoringFrequency) {
    setSaving(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/monitoring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled, frequency: nextFrequency }),
      });
      const data = await res.json();
      if (res.ok) {
        onChanged({
          monitoringEnabled: data.website.monitoringEnabled,
          monitoringFrequency: data.website.monitoringFrequency,
          nextScheduledCrawlAt: data.website.nextScheduledCrawlAt,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-ink-950/10 bg-white/60 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-ink-950">Automatic updates</p>
        <p className="mt-0.5 text-xs text-ink-950/50">
          {enabled ? `Re-crawls ${frequency} · next run ${formatFutureTime(nextScheduledCrawlAt)}` : 'Off — regenerate manually whenever you like.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {enabled && (
          <select
            value={frequency}
            disabled={saving}
            onChange={(e) => update(true, e.target.value as MonitoringFrequency)}
            className="rounded-lg border border-ink-950/15 bg-white px-2.5 py-1.5 text-xs text-ink-950 focus:outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        )}
        <button
          onClick={() => update(!enabled, frequency)}
          disabled={saving}
          className={`relative h-6 w-11 rounded-full transition ${enabled ? 'bg-moss' : 'bg-ink-950/15'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  );
}
