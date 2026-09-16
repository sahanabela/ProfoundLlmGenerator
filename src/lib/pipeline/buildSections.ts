// PHASE 5: turns this crawl's included WorkingPage rows into the sections
// that will actually render, honoring any manual sectionOverride left over
// from a prior Editable Preview edit.

import type { Page } from '@prisma/client';
import { groupPagesBySection, type EditableSectionCandidate } from '@/lib/generator/editorSections';
import { toLink } from '@/lib/generator/sections';
import type { ExclusionReason, LlmsTxtSection } from '@/types';
import type { WorkingPage } from './workingPage';

export interface OrganizedSections {
  sections: LlmsTxtSection[];
  curatedOut: Map<string, ExclusionReason>;
}

export function organizeWorkingPagesIntoSections(working: WorkingPage[], existingByUrl: Map<string, Page>): OrganizedSections {
  const candidates: EditableSectionCandidate[] = working
    .filter((w) => w.included)
    .map((w) => ({
      url: w.url,
      markdownUrl: w.markdownUrl,
      title: w.title,
      description: w.description,
      category: w.category,
      importanceScore: w.importanceScore,
      isHome: w.isHome,
      sectionOverride: existingByUrl.get(w.url)?.sectionOverride ?? null,
    }));

  const { groups, curatedOut } = groupPagesBySection(candidates);
  const sections = groups.map((g) => ({ name: g.name, pages: g.pages.map(toLink) }));
  return { sections, curatedOut };
}
