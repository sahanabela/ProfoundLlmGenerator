import { NextResponse } from 'next/server';
import { getWebsite, listChangeEvents } from '@/lib/db/repository';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const website = await getWebsite(params.id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const events = await listChangeEvents(website.id);
  return NextResponse.json({ events });
}
