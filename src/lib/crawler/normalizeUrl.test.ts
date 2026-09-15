import { describe, it, expect } from 'vitest';
import { normalizeUrl, isSameSite, isBinaryOrAssetUrl, looksLikeAuthUrl, looksLikePaginationUrl } from './normalizeUrl';

describe('normalizeUrl', () => {
  it('strips fragments', () => {
    expect(normalizeUrl('https://example.com/page#section', 'https://example.com')).toBe('https://example.com/page');
  });

  it('removes tracking params but keeps real query params', () => {
    const result = normalizeUrl('https://example.com/page?utm_source=x&id=42', 'https://example.com');
    expect(result).toBe('https://example.com/page?id=42');
  });

  it('normalizes trailing slashes (but keeps root "/")', () => {
    expect(normalizeUrl('https://example.com/docs/', 'https://example.com')).toBe('https://example.com/docs');
    expect(normalizeUrl('https://example.com/', 'https://example.com')).toBe('https://example.com/');
  });

  it('resolves relative URLs against the base', () => {
    expect(normalizeUrl('/docs/page', 'https://example.com/other')).toBe('https://example.com/docs/page');
  });

  it('rejects mailto/tel/javascript links', () => {
    expect(normalizeUrl('mailto:hi@example.com', 'https://example.com')).toBeNull();
    expect(normalizeUrl('tel:+15555555555', 'https://example.com')).toBeNull();
    expect(normalizeUrl('javascript:void(0)', 'https://example.com')).toBeNull();
  });

  it('rejects unsupported schemes', () => {
    expect(normalizeUrl('ftp://example.com/file', 'https://example.com')).toBeNull();
  });

  it('lowercases the hostname and drops default ports', () => {
    expect(normalizeUrl('https://EXAMPLE.com:443/page', 'https://example.com')).toBe('https://example.com/page');
  });

  it('produces the same normalized URL for equivalent inputs (dedup key)', () => {
    const a = normalizeUrl('https://example.com/docs/?utm_source=x#top', 'https://example.com');
    const b = normalizeUrl('https://example.com/docs', 'https://example.com');
    expect(a).toBe(b);
  });
});

describe('isSameSite', () => {
  it('treats www and bare domain as the same site', () => {
    expect(isSameSite('https://www.example.com/page', 'https://example.com')).toBe(true);
  });

  it('rejects a different domain', () => {
    expect(isSameSite('https://other.com/page', 'https://example.com')).toBe(false);
  });
});

describe('isBinaryOrAssetUrl', () => {
  it('flags common binary/asset extensions', () => {
    expect(isBinaryOrAssetUrl('https://example.com/logo.png')).toBe(true);
    expect(isBinaryOrAssetUrl('https://example.com/app.js')).toBe(true);
    expect(isBinaryOrAssetUrl('https://example.com/report.pdf')).toBe(true);
  });

  it('does not flag normal pages', () => {
    expect(isBinaryOrAssetUrl('https://example.com/docs/getting-started')).toBe(false);
  });
});

describe('URL shape heuristics', () => {
  it('detects auth-flow URLs', () => {
    expect(looksLikeAuthUrl('https://example.com/login')).toBe(true);
    expect(looksLikeAuthUrl('https://example.com/account/logout')).toBe(true);
    expect(looksLikeAuthUrl('https://example.com/docs')).toBe(false);
  });

  it('detects pagination URLs', () => {
    expect(looksLikePaginationUrl('https://example.com/blog/page/3')).toBe(true);
    expect(looksLikePaginationUrl('https://example.com/blog?page=2')).toBe(true);
    expect(looksLikePaginationUrl('https://example.com/blog')).toBe(false);
  });
});
