import { NextResponse } from 'next/server';
import { getWebsite, listChangeEvents } from '@/lib/db/repository';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const events = await listChangeEvents(website.id);
  return NextResponse.json({ events });
}
