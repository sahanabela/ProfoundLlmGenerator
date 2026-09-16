import { NextResponse } from 'next/server';
import { getWebsite, getPagesForWebsite } from '@/lib/db/repository';
import { groupPagesBySection, buildCandidatesFromStoredPages, isHomepageUrl } from '@/lib/generator/editorSections';

// Backs the "Editable Preview": pages grouped exactly the way they'd render
// in llms.txt right now, plus the excluded pages so a person can re-add one.
// A read-only preview — see regenerate-file for the endpoint that actually
// persists any newly-curated-out pages.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const website = await getWebsite(params.id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const allPages = await getPagesForWebsite(website.id);
  const candidates = buildCandidatesFromStoredPages(
    allPages.filter((p) => p.included),
    website.normalizedUrl,
  );

  const { groups, curatedOut } = groupPagesBySection(candidates);
  const sections = groups.map((g) => ({ name: g.name, pages: g.pages.map((p) => toEditorPage(p, null)) }));

  const alreadyExcluded = allPages
    .filter((p) => !p.included && !isHomepageUrl(p.url, website.normalizedUrl))
    .map((p) => toEditorPage(p, p.excludeReason));
  const newlyCuratedOut = candidates.filter((c) => curatedOut.has(c.url)).map((c) => toEditorPage(c, curatedOut.get(c.url)!));
  const excluded = [...alreadyExcluded, ...newlyCuratedOut].sort((a, b) => b.importanceScore - a.importanceScore);

  return NextResponse.json({ sections, excluded });
}

function toEditorPage(
  page: {
    id: string;
    url: string;
    markdownUrl: string | null;
    title: string | null;
    description: string | null;
    category: string | null;
    importanceScore: number;
    sectionOverride: string | null;
  },
  excludeReason: string | null,
) {
  return {
    id: page.id,
    url: page.url,
    markdownUrl: page.markdownUrl,
    title: page.title || page.url,
    description: page.description || '',
    category: page.category || 'Resources',
    importanceScore: page.importanceScore,
    excludeReason,
    sectionOverride: page.sectionOverride,
  };
}
