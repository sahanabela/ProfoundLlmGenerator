// Nice feature: detect an existing /llms.txt on the live site before we
// generate our own, so the UI can show it and let the user compare.

import { safeFetch } from '@/lib/security/safeFetch';

export async function fetchExistingLlmsTxt(origin: string, timeoutMs: number): Promise<string | null> {
  const res = await safeFetch(new URL('/llms.txt', origin).toString(), { timeoutMs });
  if (!res.ok || !res.body) return null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) return null; // likely a SPA catch-all, not a real llms.txt
  const trimmed = res.body.trim();
  if (!trimmed.startsWith('#')) return null; // doesn't look like a real llms.txt (no H1)
  return res.body;
}
