// Section grouping that additionally honors a per-page manual sectionOverride
// (set via the "Editable Preview"). Shared by three call sites that must all
// agree on "what section is this page in right now":
//   1. the crawl pipeline, when it renders the file right after a crawl
//   2. the editor GET endpoint, to show pages grouped the way they'll render
//   3. the edit-only regenerate endpoint, to rebuild the file after edits
//
// Pages with no override still go through the exact same organizeSections()
// curation (caps, overflow-to-Optional) used at crawl time — a manually
// placed page bypasses those caps entirely, since that's an explicit choice.

import { organizeSections, type SectionCandidate } from './sections';
import { KNOWN_CATEGORIES } from '@/lib/analyzer/classify';
import { normalizeOrigin } from '@/lib/crawler/normalizeUrl';
import type { ExclusionReason } from '@/types';

export interface EditableSectionCandidate extends SectionCandidate {
  sectionOverride: string | null;
}

/** True if `url` is the given website's homepage — it's folded into the H1/summary, never listed as a link. */
export function isHomepageUrl(url: string, websiteOrigin: string): boolean {
  try {
    return normalizeOrigin(url) === websiteOrigin && new URL(url).pathname === '/';
  } catch {
    return false;
  }
}

/** The subset of a persisted Page row that building an EditableSectionCandidate needs. */
export interface StoredPageLike {
  id: string;
  url: string;
  markdownUrl: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  importanceScore: number;
  sectionOverride: string | null;
}

/**
 * Turns currently-included Page rows into candidates for groupPagesBySection.
 * Shared by the editor GET endpoint and the edit-only regenerate endpoint so
 * "what does an included page look like as a candidate" can't drift between
 * the two — see regenerateFromStoredPages and /api/websites/:id/editor.
 */
export function buildCandidatesFromStoredPages<T extends StoredPageLike>(
  pages: T[],
  websiteOrigin: string,
): (EditableSectionCandidate & { id: string })[] {
  return pages.map((p) => ({
    id: p.id,
    url: p.url,
    markdownUrl: p.markdownUrl,
    title: p.title || p.url,
    description: p.description || '',
    category: p.category || 'Resources',
    importanceScore: p.importanceScore,
    isHome: isHomepageUrl(p.url, websiteOrigin),
    sectionOverride: p.sectionOverride,
  }));
}

export interface GroupedSections<T extends EditableSectionCandidate> {
  groups: { name: string; pages: T[] }[];
  curatedOut: Map<string, ExclusionReason>;
}

export function groupPagesBySection<T extends EditableSectionCandidate>(candidates: T[]): GroupedSections<T> {
  const manual = candidates.filter((c) => !c.isHome && c.sectionOverride && c.sectionOverride.trim());
  const auto = candidates.filter((c) => !c.sectionOverride || !c.sectionOverride.trim());

  const autoResult = organizeSections(auto);

  const byName = new Map<string, T[]>();
  const push = (name: string, page: T) => {
    const arr = byName.get(name) ?? [];
    arr.push(page);
    byName.set(name, arr);
  };

  for (const page of auto) {
    if (page.isHome) continue;
    const name = autoResult.pageSectionMap.get(page.url);
    if (name) push(name, page);
  }
  for (const page of manual) {
    push(page.sectionOverride!.trim(), page);
  }

  const orderedNames = orderSectionNames(byName.keys());
  const groups = orderedNames
    .map((name) => ({ name, pages: [...byName.get(name)!].sort((a, b) => b.importanceScore - a.importanceScore) }))
    .filter((g) => g.pages.length > 0);

  return { groups, curatedOut: autoResult.curatedOut };
}

/** Known categories first (in their canonical order), then any custom/renamed sections alphabetically, "Optional" always last. */
export function orderSectionNames(names: Iterable<string>): string[] {
  const set = new Set(names);
  const known = KNOWN_CATEGORIES.filter((c) => set.has(c));
  const custom = Array.from(set)
    .filter((n) => !(KNOWN_CATEGORIES as readonly string[]).includes(n) && n !== 'Optional')
    .sort((a, b) => a.localeCompare(b));
  const optional = set.has('Optional') ? ['Optional'] : [];
  return [...known, ...custom, ...optional];
}
