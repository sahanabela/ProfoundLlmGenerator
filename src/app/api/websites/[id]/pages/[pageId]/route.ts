import { NextRequest, NextResponse } from 'next/server';
import { getPageForWebsite, applyPageEdit } from '@/lib/db/repository';

// A single manual edit from the "Editable Preview": description, section
// (move/rename via override), or included (remove/re-add).
export async function PATCH(req: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  const existing = await getPageForWebsite(params.id, params.pageId);
  if (!existing) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const edit: { description?: string; section?: string | null; included?: boolean } = {};

  if (typeof body.description === 'string') edit.description = body.description.slice(0, 400);
  if (typeof body.section === 'string' || body.section === null) edit.section = body.section;
  if (typeof body.included === 'boolean') edit.included = body.included;

  if (Object.keys(edit).length === 0) {
    return NextResponse.json({ error: 'Nothing to update — expected description, section, and/or included.' }, { status: 400 });
  }

  const updated = await applyPageEdit(params.pageId, edit);
  return NextResponse.json({ page: updated });
}
