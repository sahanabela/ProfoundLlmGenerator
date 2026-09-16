// PHASE 7: Validation.
//
// Deliberately a pragmatic line-based checker rather than a full Markdown
// AST — llms.txt's grammar is simple enough that this covers the spec's
// structural rules without pulling in a Markdown parser dependency. Works on
// any raw llms.txt text, including ones we didn't generate (e.g. an existing
// file discovered on the live site).

import type { ValidationIssue, ValidationResult } from '@/types';

const H1_RE = /^#\s+(.+)$/;
const H2_RE = /^##\s+(.+)$/;
const LINK_ITEM_RE = /^-\s+\[([^\]]+)\]\(([^)\s]+)\)(?::\s*(.*))?$/;
const LOOSE_LIST_RE = /^[-*]\s+/;

export function validateLlmsTxt(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lines = content.split(/\r?\n/);

  let h1Count = 0;
  let sawH1 = false;
  let sectionCount = 0;
  let linkCount = 0;
  let currentSectionName: string | null = null;
  let currentSectionLinkCount = 0;

  const urlsSeen = new Set<string>();
  const duplicateUrls = new Set<string>();

  const closeSection = () => {
    if (currentSectionName !== null && currentSectionLinkCount === 0) {
      issues.push({ level: 'error', message: `Section "${currentSectionName}" has no links` });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // H1_RE requires exactly one leading "#" followed by whitespace, so a
    // "##..." line can never match it — no extra guard needed here.
    if (H1_RE.test(line)) {
      h1Count++;
      sawH1 = true;
      continue;
    }

    const h2Match = line.match(H2_RE);
    if (h2Match) {
      closeSection();
      if (!sawH1) issues.push({ level: 'error', message: `Section "${h2Match[1]}" appears before the H1 title` });
      sectionCount++;
      currentSectionName = h2Match[1].trim();
      currentSectionLinkCount = 0;
      continue;
    }

    const linkMatch = line.match(LINK_ITEM_RE);
    if (linkMatch) {
      linkCount++;
      currentSectionLinkCount++;
      const url = linkMatch[2].trim();
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        issues.push({ level: 'error', message: `Invalid link URL: "${url}"` });
      }
      if (urlsSeen.has(url)) duplicateUrls.add(url);
      urlsSeen.add(url);
      continue;
    }

    if (LOOSE_LIST_RE.test(line) && currentSectionName !== null) {
      issues.push({ level: 'warning', message: `List item doesn't match "- [Title](url): description": "${line.slice(0, 80)}"` });
    }
  }
  closeSection();

  if (h1Count === 0) issues.push({ level: 'error', message: 'Missing the required H1 site/project title' });
  if (h1Count > 1) issues.push({ level: 'error', message: `Found ${h1Count} H1 headings — exactly one is allowed` });
  if (duplicateUrls.size > 0) {
    issues.push({ level: 'error', message: `Duplicate URLs: ${Array.from(duplicateUrls).slice(0, 5).join(', ')}${duplicateUrls.size > 5 ? '…' : ''}` });
  }

  const valid = issues.every((issue) => issue.level !== 'error');

  return { valid, issues, linkCount, sectionCount };
}
