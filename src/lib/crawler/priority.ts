// Discovery-time prioritization: when a crawl is capped at MAX_PAGES, we want
// to spend the budget on likely-important paths first rather than crawling
// breadth-first in whatever order links happened to appear.
//
// This is a *signal*, not a hard rule — see PHASE 4 for the full importance
// score used at analysis time, which also weighs content and inbound links.

const HIGH_PRIORITY_PATTERNS: [RegExp, number][] = [
  [/^\/$/, 30],
  [/^\/(docs?|documentation)(\/|$)/, 22],
  [/^\/(guides?|tutorials?)(\/|$)/, 20],
  [/^\/(getting-started|quickstart|quick-start)(\/|$)/, 22],
  [/^\/(api|reference)(\/|$)/, 20],
  [/^\/(product|features?)(\/|$)/, 14],
  [/^\/pricing(\/|$)/, 12],
  [/^\/(about|company)(\/|$)/, 10],
  [/^\/(help|support|faq)(\/|$)/, 12],
  [/^\/(resources?|changelog|release-notes)(\/|$)/, 10],
  [/^\/blog(\/|$)/, 8],
];

const LOW_PRIORITY_PATTERNS: [RegExp, number][] = [
  [/^\/(login|signin|sign-in|signup|sign-up|register|logout|sign-out)(\/|$)/, -30],
  [/^\/(cart|checkout)(\/|$)/, -25],
  [/^\/(cookies?|privacy|terms|legal)(\/|$)/, -20],
  [/^\/account(\/|$)/, -15],
  [/^\/search(\/|$)/, -15],
  [/\/page\/\d+\/?$/, -20],
];

export function discoveryPriority(url: string, depth: number, sitemapPriority?: number): number {
  let score = 0;
  try {
    const { pathname } = new URL(url);
    for (const [pattern, weight] of HIGH_PRIORITY_PATTERNS) if (pattern.test(pathname)) score += weight;
    for (const [pattern, weight] of LOW_PRIORITY_PATTERNS) if (pattern.test(pathname)) score += weight;
  } catch {
    /* ignore */
  }

  if (sitemapPriority !== undefined && !Number.isNaN(sitemapPriority)) {
    score += sitemapPriority * 10; // sitemap <priority> is 0.0–1.0
  }

  score -= depth * 3; // prefer shallower pages, all else equal

  return score;
}
