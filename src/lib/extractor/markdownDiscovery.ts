// Phase 3: Markdown Discovery.
//
// Prefer an explicitly declared <link rel="alternate" type="text/markdown">.
// Otherwise, try the two conventional patterns from the llms.txt v2 spec
// (append ".md", or replace the extension with ".md") — but only trust them
// after verifying the URL actually resolves to something markdown-ish.

import { safeFetch } from '@/lib/security/safeFetch';

export async function discoverMarkdownUrl(pageUrl: string, declaredAlternate: string | null, timeoutMs: number): Promise<string | null> {
  if (declaredAlternate) {
    const ok = await verifyMarkdownUrl(declaredAlternate, timeoutMs);
    if (ok) return declaredAlternate;
  }

  for (const candidate of candidateMarkdownUrls(pageUrl)) {
    const ok = await verifyMarkdownUrl(candidate, timeoutMs);
    if (ok) return candidate;
  }

  return null;
}

function candidateMarkdownUrls(pageUrl: string): string[] {
  try {
    const url = new URL(pageUrl);
    const candidates: string[] = [];

    // Pattern A: append .md to the full path (page.html.md, or /path.md if no extension).
    const appended = new URL(url.toString());
    appended.search = '';
    appended.hash = '';
    appended.pathname = appended.pathname === '/' ? '/index.md' : `${appended.pathname}.md`;
    candidates.push(appended.toString());

    // Pattern B: replace the existing extension with .md (page.html -> page.md).
    if (/\.\w+$/.test(url.pathname) && !url.pathname.endsWith('.md')) {
      const replaced = new URL(url.toString());
      replaced.search = '';
      replaced.hash = '';
      replaced.pathname = replaced.pathname.replace(/\.\w+$/, '.md');
      candidates.push(replaced.toString());
    }

    return candidates;
  } catch {
    return [];
  }
}

async function verifyMarkdownUrl(url: string, timeoutMs: number): Promise<boolean> {
  const res = await safeFetch(url, { timeoutMs: Math.min(timeoutMs, 6000), maxBytes: 2048 });
  if (!res.ok) return false;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) return false; // most servers 200 an SPA fallback for anything
  if (contentType.includes('markdown') || contentType.includes('text/plain')) return true;
  // Some static hosts serve .md with octet-stream/no content-type — sniff the body.
  const body = res.body.trim();
  if (body.startsWith('#') || body.startsWith('---')) return true;
  return false;
}
