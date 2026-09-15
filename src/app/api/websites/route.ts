import { NextRequest, NextResponse } from 'next/server';
import { checkUrlSafety } from '@/lib/security/ssrf';
import { validateAndNormalizeInputUrl, createOrGetWebsite, listWebsites } from '@/lib/db/repository';
import { runCrawlPipeline } from '@/lib/pipeline';

export async function GET() {
  const websites = await listWebsites();
  return NextResponse.json({ websites });
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body with a "url" field.' }, { status: 400 });
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'Missing "url" field.' }, { status: 400 });
  }

  const normalized = validateAndNormalizeInputUrl(body.url);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const safety = await checkUrlSafety(normalized.baseUrl);
  if (!safety.safe) {
    return NextResponse.json({ error: `We can't crawl that URL: ${safety.reason}` }, { status: 400 });
  }

  const website = await createOrGetWebsite(normalized.baseUrl, normalized.origin);

  // Kick off the crawl pipeline in the background — the client polls
  // GET /api/websites/:id/status for live progress. This relies on the dev/
  // start server being a long-lived Node process; see README > Tradeoffs for
  // how this would change behind a serverless deployment.
  runCrawlPipeline(website.id, 'manual').catch((err) => {
    console.error(`[pipeline] crawl failed for website ${website.id}:`, err);
  });

  return NextResponse.json({ websiteId: website.id }, { status: 202 });
}
