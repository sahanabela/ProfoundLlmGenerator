import { NextResponse } from 'next/server';
import { getWebsite, getPagesForWebsite } from '@/lib/db/repository';
import { groupPagesBySection, type EditableSectionCandidate } from '@/lib/generator/editorSections';
import { normalizeOrigin } from '@/lib/crawler/normalizeUrl';

// Backs the "Editable Preview": pages grouped exactly the way they'd render
// in llms.txt right now, plus the excluded pages so a person can re-add one.
// A read-only preview — see regenerate-file for the endpoint that actually
// persists any newly-curated-out pages.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const website = await getWebsite(params.id);
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 });

  const allPages = await getPagesForWebsite(website.id);

  const isHome = (url: string) => {
    try {
      return normalizeOrigin(url) === website.normalizedUrl && new URL(url).pathname === '/';
    } catch {
      return false;
    }
  };

  const candidates: (EditableSectionCandidate & { id: string; excludeReason: string | null })[] = allPages
    .filter((p) => p.included)
    .map((p) => ({
      id: p.id,
      url: p.url,
      markdownUrl: p.markdownUrl,
      title: p.title || p.url,
      description: p.description || '',
      category: p.category || 'Resources',
      importanceScore: p.importanceScore,
      isHome: isHome(p.url),
      sectionOverride: p.sectionOverride,
      excludeReason: null,
    }));

  const { groups, curatedOut } = groupPagesBySection(candidates);
  const sections = groups.map((g) => ({ name: g.name, pages: g.pages.map(toEditorPage) }));

  const alreadyExcluded = allPages.filter((p) => !p.included && !isHome(p.url)).map(toEditorPage);
  const newlyCuratedOut = candidates
    .filter((c) => curatedOut.has(c.url))
    .map((c) => toEditorPage({ ...c, excludeReason: curatedOut.get(c.url)! }));
  const excluded = [...alreadyExcluded, ...newlyCuratedOut].sort((a, b) => b.importanceScore - a.importanceScore);

  return NextResponse.json({ sections, excluded });
}

function toEditorPage(page: {
  id: string;
  url: string;
  markdownUrl: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  importanceScore: number;
  excludeReason: string | null;
  sectionOverride: string | null;
}) {
  return {
    id: page.id,
    url: page.url,
    markdownUrl: page.markdownUrl,
    title: page.title || page.url,
    description: page.description || '',
    category: page.category || 'Resources',
    importanceScore: page.importanceScore,
    excludeReason: page.excludeReason,
    sectionOverride: page.sectionOverride,
  };
}
