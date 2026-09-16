import { NextResponse } from 'next/server';
import { getWebsite } from '@/lib/db/repository';
import { regenerateFromStoredPages } from '@/lib/pipeline';

// Rebuilds llms.txt from the current (possibly hand-edited) Page rows,
// without recrawling. Used by the "Editable Preview"'s Save action.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const website = await getWebsite(params.id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  try {
    const result = await regenerateFromStoredPages(website.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to regenerate llms.txt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
