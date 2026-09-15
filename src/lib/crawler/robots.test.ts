import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, isAllowedByRobots } from './robots';

describe('parseRobotsTxt', () => {
  it('parses disallow/allow rules for the wildcard group', () => {
    const rules = parseRobotsTxt(`
      User-agent: *
      Disallow: /private
      Disallow: /admin/
      Allow: /admin/public

      Sitemap: https://example.com/sitemap.xml
    `);
    expect(rules.disallow).toEqual(['/private', '/admin/']);
    expect(rules.allow).toEqual(['/admin/public']);
    expect(rules.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  it('prefers a group targeted at our bot over the wildcard group', () => {
    const rules = parseRobotsTxt(`
      User-agent: *
      Disallow: /everything

      User-agent: LlmsTxtGeneratorBot
      Disallow: /only-this
    `);
    expect(rules.disallow).toEqual(['/only-this']);
  });
});

describe('isAllowedByRobots', () => {
  it('allows everything when robots.txt was not fetched', () => {
    expect(isAllowedByRobots('/anything', { fetched: false, disallow: [], allow: [], sitemaps: [] })).toBe(true);
  });

  it('disallows a blocked path', () => {
    const rules = { fetched: true, disallow: ['/private'], allow: [], sitemaps: [] };
    expect(isAllowedByRobots('/private/page', rules)).toBe(false);
    expect(isAllowedByRobots('/public/page', rules)).toBe(true);
  });

  it('uses the longest (most specific) matching rule', () => {
    const rules = { fetched: true, disallow: ['/docs'], allow: ['/docs/public'], sitemaps: [] };
    expect(isAllowedByRobots('/docs/public/page', rules)).toBe(true);
    expect(isAllowedByRobots('/docs/private', rules)).toBe(false);
  });

  it('supports wildcard patterns', () => {
    const rules = { fetched: true, disallow: ['/*?print='], allow: [], sitemaps: [] };
    expect(isAllowedByRobots('/article?print=1', rules)).toBe(false);
  });
});
