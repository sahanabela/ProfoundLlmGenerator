// PHASE 4: deterministic category classification, tried before any LLM call.

export const KNOWN_CATEGORIES = [
  'Getting Started',
  'Documentation',
  'Guides',
  'API Reference',
  'Product',
  'Resources',
  'Support',
  'Company',
  'Blog',
] as const;

export type KnownCategory = (typeof KNOWN_CATEGORIES)[number];

export interface ClassificationResult {
  category: KnownCategory;
  confident: boolean;
}

const PATH_RULES: [RegExp, KnownCategory][] = [
  [/^\/(getting-started|quickstart|quick-start|start|onboarding)(\/|$)/, 'Getting Started'],
  [/^\/(docs?|documentation|manual)(\/|$)/, 'Documentation'],
  [/^\/(guides?|tutorials?|how-to|walkthroughs?)(\/|$)/, 'Guides'],
  [/^\/(api|reference|sdk)(\/|$)/, 'API Reference'],
  [/^\/(product|features?|pricing|solutions?)(\/|$)/, 'Product'],
  [/^\/(resources?|changelog|release-notes|downloads?|templates?)(\/|$)/, 'Resources'],
  [/^\/(support|help|faq|contact)(\/|$)/, 'Support'],
  [/^\/(about|company|team|careers|jobs|press|partners)(\/|$)/, 'Company'],
  [/^\/blog(\/|$)/, 'Blog'],
  [/^\/news(\/|$)/, 'Blog'],
];

const KEYWORD_RULES: [RegExp, KnownCategory][] = [
  [/\b(quickstart|getting started|installation|set ?up your)\b/i, 'Getting Started'],
  [/\b(api reference|endpoint|sdk reference|rest api|graphql)\b/i, 'API Reference'],
  [/\b(guide|tutorial|walkthrough|how to|step[- ]by[- ]step)\b/i, 'Guides'],
  [/\b(pricing|plans?|core features?)\b/i, 'Product'],
  [/\b(frequently asked|faq|support|help center)\b/i, 'Support'],
  [/\b(about us|our team|careers|we're hiring)\b/i, 'Company'],
  [/\b(changelog|release notes|what's new)\b/i, 'Resources'],
];

export function classifyDeterministic(page: { url: string; title: string; headings: string[] }): ClassificationResult {
  let path = '/';
  try {
    path = new URL(page.url).pathname;
  } catch {
    /* ignore */
  }

  for (const [pattern, category] of PATH_RULES) {
    if (pattern.test(path)) return { category, confident: true };
  }

  const haystack = `${page.title} ${page.headings.slice(0, 5).join(' ')}`;
  for (const [pattern, category] of KEYWORD_RULES) {
    if (pattern.test(haystack)) return { category, confident: true };
  }

  return { category: 'Resources', confident: false };
}
