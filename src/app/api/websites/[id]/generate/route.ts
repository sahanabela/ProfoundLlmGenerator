import { NextResponse } from 'next/server';
import { getWebsite } from '@/lib/db/repository';
import { runCrawlPipeline } from '@/lib/pipeline';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const website = await getWebsite(params.id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  runCrawlPipeline(website.id, 'manual').catch((err) => {
    console.error(`[pipeline] crawl failed for website ${website.id}:`, err);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
