// Metadata extraction with a fallback hierarchy, as specced:
//   title:       og:title -> <title> -> first <h1> -> URL-derived
//   description: meta description -> og:description -> first meaningful paragraph -> generated fallback

import * as cheerio from 'cheerio';

export interface PageMetadata {
  title: string;
  description: string;
  canonicalUrl: string | null;
  markdownAlternateUrl: string | null;
  headings: string[];
  siteName: string | null;
}

export function extractMetadata($: cheerio.CheerioAPI, url: string, firstParagraph: string, firstH1: string): PageMetadata {
  const ogTitle = clean($('meta[property="og:title"]').attr('content'));
  const titleTag = clean($('title').first().text());
  const title = ogTitle || titleTag || firstH1 || titleFromUrl(url);

  const metaDescription = clean($('meta[name="description"]').attr('content'));
  const ogDescription = clean($('meta[property="og:description"]').attr('content'));
  const description = metaDescription || ogDescription || truncate(firstParagraph, 200) || `Page from ${new URL(url).hostname}: ${title}`;

  const canonicalHref = $('link[rel="canonical"]').attr('href');
  const canonicalUrl = canonicalHref ? safeResolve(canonicalHref, url) : null;

  const markdownHref = $('link[rel="alternate"][type="text/markdown"]').attr('href');
  const markdownAlternateUrl = markdownHref ? safeResolve(markdownHref, url) : null;

  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const text = clean($(el).text());
    if (text && headings.length < 20) headings.push(text);
  });

  const siteName = clean($('meta[property="og:site_name"]').attr('content')) || null;

  return { title, description, canonicalUrl, markdownAlternateUrl, headings, siteName };
}

function titleFromUrl(url: string): string {
  try {
    const { pathname, hostname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop();
    if (!last) return hostname;
    return last
      .replace(/[-_]+/g, ' ')
      .replace(/\.\w+$/, '')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

function clean(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  const t = clean(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function safeResolve(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
