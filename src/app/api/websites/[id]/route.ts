import { NextResponse } from 'next/server';
import { getWebsite, getLatestGeneratedFile, getLatestCrawl, getPagesForWebsite } from '@/lib/db/repository';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const website = await getWebsite(params.id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const [generatedFile, latestCrawl, pages] = await Promise.all([
    getLatestGeneratedFile(website.id),
    getLatestCrawl(website.id),
    getPagesForWebsite(website.id),
  ]);

  return NextResponse.json({
    website,
    generatedFile,
    latestCrawl,
    pageCount: pages.length,
    includedCount: pages.filter((p) => p.included).length,
  });
}
