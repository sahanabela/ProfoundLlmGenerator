import { NextResponse } from 'next/server';
import { getWebsite, getPagesForWebsite } from '@/lib/db/repository';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const website = await getWebsite(params.id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const pages = await getPagesForWebsite(website.id);
  return NextResponse.json({ pages });
}
