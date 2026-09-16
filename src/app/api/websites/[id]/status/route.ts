import { NextResponse } from 'next/server';
import { getWebsite, getLatestCrawl, getLatestGeneratedFile } from '@/lib/db/repository';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const [crawl, generatedFile] = await Promise.all([getLatestCrawl(website.id), getLatestGeneratedFile(website.id)]);

  return NextResponse.json({
    website,
    crawl,
    generatedFile: crawl?.status === 'completed' ? generatedFile : null,
  });
}
