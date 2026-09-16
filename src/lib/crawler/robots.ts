// Minimal robots.txt fetch + parser. Good enough to respect Disallow rules
// for our bot's user-agent and the "*" group, and to discover Sitemap: lines.

import { safeFetch } from '@/lib/security/safeFetch';

export interface RobotsRules {
  fetched: boolean;
  disallow: string[];
  allow: string[];
  sitemaps: string[];
  crawlDelaySeconds?: number;
}

// Must match the bot name in safeFetch.ts's User-Agent header (lowercased,
// no version/comment suffix) so a robots.txt group written for our bot by
// name actually matches.
const OUR_AGENT = 'waypointllmstxtbot';

export async function fetchRobots(origin: string, timeoutMs: number): Promise<RobotsRules> {
  const result = await safeFetch(new URL('/robots.txt', origin).toString(), { timeoutMs });
  if (!result.ok || !result.body) {
    return { fetched: false, disallow: [], allow: [], sitemaps: [] };
  }
  return parseRobotsTxt(result.body);
}

export function parseRobotsTxt(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const sitemaps: string[] = [];

  // Group rules by user-agent block.
  type Group = { agents: string[]; disallow: string[]; allow: string[]; crawlDelay?: number };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [value.toLowerCase()], disallow: [], allow: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
      continue;
    }
    if (!current) continue;
    if (field === 'disallow' && value) current.disallow.push(value);
    else if (field === 'allow' && value) current.allow.push(value);
    else if (field === 'crawl-delay') current.crawlDelay = Number(value) || undefined;
  }

  const specific = groups.find((g) => g.agents.some((a) => a.includes(OUR_AGENT)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const applicable = specific ?? wildcard;

  return {
    fetched: true,
    disallow: applicable?.disallow ?? [],
    allow: applicable?.allow ?? [],
    sitemaps,
    crawlDelaySeconds: applicable?.crawlDelay,
  };
}

/** Longest-match robots.txt semantics: the most specific matching rule wins. */
export function isAllowedByRobots(pathWithQuery: string, rules: RobotsRules): boolean {
  if (!rules.fetched) return true;

  let bestMatch: { length: number; allowed: boolean } | null = null;

  for (const pattern of rules.disallow) {
    if (pattern === '') continue; // empty Disallow means "allow everything"
    if (matchesRobotsPattern(pathWithQuery, pattern)) {
      if (!bestMatch || pattern.length > bestMatch.length) bestMatch = { length: pattern.length, allowed: false };
    }
  }
  for (const pattern of rules.allow) {
    if (matchesRobotsPattern(pathWithQuery, pattern)) {
      if (!bestMatch || pattern.length > bestMatch.length) bestMatch = { length: pattern.length, allowed: true };
    }
  }

  return bestMatch ? bestMatch.allowed : true;
}

function matchesRobotsPattern(path: string, pattern: string): boolean {
  // Support the common robots.txt wildcard `*` and end-anchor `$`. Every
  // pattern is a prefix match (implicit `^`) unless it ends with a literal
  // `$`, which the middle .replace() turns back into a real regex end-anchor
  // after the first .replace() escaped it along with the rest of the pattern.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  try {
    return new RegExp(`^${escaped}`).test(path);
  } catch {
    return path.startsWith(pattern);
  }
}
