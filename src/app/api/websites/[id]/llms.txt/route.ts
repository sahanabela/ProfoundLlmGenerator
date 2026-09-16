import { NextResponse } from 'next/server';
import { getWebsite, getLatestGeneratedFile } from '@/lib/db/repository';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const file = await getLatestGeneratedFile(website.id);
  if (!file) return NextResponse.json({ error: 'No generated file yet' }, { status: 404 });

  return new NextResponse(file.content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="llms.txt"',
    },
  });
}
