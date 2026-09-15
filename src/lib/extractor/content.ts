// Pragmatic main-content extraction: prefer semantic <main>/<article>, and
// otherwise strip chrome (nav/header/footer/scripts/etc) and take what's left.
// This is not a full Readability port — it's deliberately simple.

import * as cheerio from 'cheerio';

const CHROME_SELECTORS = [
  'nav',
  'header',
  'footer',
  'script',
  'style',
  'noscript',
  'svg',
  'form',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  '.cookie',
  '.cookies',
  '.cookie-banner',
  '.cookie-consent',
  '#cookie-banner',
  '.nav',
  '.navbar',
  '.sidebar',
  '.breadcrumbs',
  '.breadcrumb',
  '.pagination',
  '.site-header',
  '.site-footer',
  '.skip-link',
];

export interface ExtractedContent {
  mainContent: string;
  firstParagraph: string;
  firstH1: string;
  wordCount: number;
}

export function extractMainContent(html: string): { $: cheerio.CheerioAPI; content: ExtractedContent } {
  const $ = cheerio.load(html);

  const firstH1 = clean($('h1').first().text());

  // Work on a clone so we can strip chrome without disturbing the DOM the
  // caller still needs for metadata (title/meta tags live outside <main>).
  const $content = cheerio.load($.html());
  CHROME_SELECTORS.forEach((sel) => $content(sel).remove());

  let $root = $content('main').first();
  if ($root.length === 0) $root = $content('article').first();
  if ($root.length === 0) $root = $content('[role="main"]').first();
  if ($root.length === 0) $root = $content('body');

  // Skip paragraphs inside callout/admonition boxes (tips, warnings, "hey
  // LLM" banners, etc) when picking a representative first paragraph — they
  // tend to be generic boilerplate repeated on every page, not a summary.
  const firstParagraph = clean(
    $root
      .find('p')
      .filter((_, el) => $content(el).closest('.custom-block, .callout, .admonition, .alert, .banner, [class*="tip"], [class*="warning"], [class*="note-block"]').length === 0)
      .first()
      .text(),
  );

  const text = clean($root.text());
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return {
    $,
    content: {
      mainContent: truncate(text, 6000),
      firstParagraph,
      firstH1,
      wordCount,
    },
  };
}

/** Heuristic signal for "this page is basically empty HTML" -> maybe needs JS rendering. */
export function looksLikeEmptyShell(content: ExtractedContent, html: string): boolean {
  if (content.wordCount >= 40) return false;
  // A large HTML payload with almost no extracted text usually means the
  // meaningful content is rendered client-side (SPA app root, etc).
  return html.length > 1500;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}
