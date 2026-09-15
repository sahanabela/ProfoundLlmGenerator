// PHASE 5: Section Organization.
//
// Groups already-included pages into a small number of meaningful H2
// sections, caps how many pages each section (and the file overall) can
// carry, and demotes overflow/low-importance pages into "Optional" rather
// than dropping them outright when there's room.

import { KNOWN_CATEGORIES } from '@/lib/analyzer/classify';
import { importanceBand } from '@/lib/analyzer/importance';
import type { ExclusionReason, LlmsTxtLink, LlmsTxtSection } from '@/types';

export const MAX_PAGES_PER_SECTION = 8;
export const MAX_OPTIONAL_SECTION = 12;
export const MAX_TOTAL_PAGES = 60;

const SECTION_ORDER = [...KNOWN_CATEGORIES];

export interface SectionCandidate {
  url: string;
  markdownUrl: string | null;
  title: string;
  description: string;
  category: string;
  importanceScore: number;
  isHome: boolean;
}

export interface OrganizeResult {
  sections: LlmsTxtSection[];
  curatedOut: Map<string, ExclusionReason>;
}

export function organizeSections(pages: SectionCandidate[]): OrganizeResult {
  const curatedOut = new Map<string, ExclusionReason>();
  const buckets = new Map<string, SectionCandidate[]>();

  for (const page of pages) {
    // The homepage is folded into the H1/summary, not listed as a link.
    if (page.isHome) continue;
    const band = importanceBand(page.importanceScore);
    const sectionName = band === 'low' ? 'Optional' : page.category;
    const arr = buckets.get(sectionName) ?? [];
    arr.push(page);
    buckets.set(sectionName, arr);
  }

  const sections: LlmsTxtSection[] = [];
  const overflowToOptional: SectionCandidate[] = [];
  let totalIncluded = 0;

  for (const name of SECTION_ORDER) {
    const bucket = buckets.get(name);
    if (!bucket || bucket.length === 0) continue;

    const sorted = [...bucket].sort((a, b) => b.importanceScore - a.importanceScore);
    let kept = sorted.slice(0, MAX_PAGES_PER_SECTION);
    const overflow = sorted.slice(MAX_PAGES_PER_SECTION);
    overflowToOptional.push(...overflow);

    if (totalIncluded + kept.length > MAX_TOTAL_PAGES) {
      const allowed = Math.max(0, MAX_TOTAL_PAGES - totalIncluded);
      kept.slice(allowed).forEach((p) => curatedOut.set(p.url, 'below-curation-threshold'));
      kept = kept.slice(0, allowed);
    }

    totalIncluded += kept.length;
    if (kept.length > 0) sections.push({ name, pages: kept.map(toLink) });
  }

  const optionalBucket = [...(buckets.get('Optional') ?? []), ...overflowToOptional];
  const sortedOptional = optionalBucket.sort((a, b) => b.importanceScore - a.importanceScore);
  let keptOptional = sortedOptional.slice(0, MAX_OPTIONAL_SECTION);
  sortedOptional.slice(MAX_OPTIONAL_SECTION).forEach((p) => curatedOut.set(p.url, 'below-curation-threshold'));

  if (totalIncluded + keptOptional.length > MAX_TOTAL_PAGES) {
    const allowed = Math.max(0, MAX_TOTAL_PAGES - totalIncluded);
    keptOptional.slice(allowed).forEach((p) => curatedOut.set(p.url, 'below-curation-threshold'));
    keptOptional = keptOptional.slice(0, allowed);
  }

  if (keptOptional.length > 0) sections.push({ name: 'Optional', pages: keptOptional.map(toLink) });

  return { sections, curatedOut };
}

function toLink(page: SectionCandidate): LlmsTxtLink {
  return {
    title: page.title,
    url: page.markdownUrl ?? page.url,
    description: page.description || undefined,
  };
}
