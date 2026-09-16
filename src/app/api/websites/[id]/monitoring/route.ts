import { NextRequest, NextResponse } from 'next/server';
import { getWebsite, updateWebsiteMonitoring } from '@/lib/db/repository';
import { computeNextRunAt } from '@/lib/monitoring/scheduler';
import type { MonitoringFrequency } from '@/types';

const VALID_FREQUENCIES: MonitoringFrequency[] = ['manual', 'daily', 'weekly'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  const frequency: MonitoringFrequency = VALID_FREQUENCIES.includes(body.frequency) ? body.frequency : 'daily';

  const nextScheduledCrawlAt = enabled ? computeNextRunAt(frequency, new Date()) : null;
  const updated = await updateWebsiteMonitoring(website.id, enabled, frequency, nextScheduledCrawlAt);

  return NextResponse.json({ website: updated });
}
