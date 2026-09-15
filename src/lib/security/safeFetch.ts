// A fetch() wrapper that applies SSRF checks to the initial URL AND every
// redirect hop, enforces a timeout, and caps how much of the response body
// we read. Used by every crawler/extractor code path — nothing should call
// the global `fetch` directly against a user-supplied URL.

import { checkUrlSafety } from './ssrf';
import { MAX_RESPONSE_BYTES } from '@/types';

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  finalUrl: string;
  body: string;
  truncated: boolean;
  error?: string;
}

const DEFAULT_UA = 'LlmsTxtGeneratorBot/1.0 (+https://github.com/llms-txt-generator; polite crawler)';

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const maxRedirects = options.maxRedirects ?? 5;

  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safety = await checkUrlSafety(currentUrl);
    if (!safety.safe) {
      return fail(currentUrl, `Blocked for safety: ${safety.reason}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': DEFAULT_UA, Accept: 'text/html,application/xhtml+xml,application/xml,text/markdown;q=0.9,*/*;q=0.5', ...options.headers },
      });
    } catch (err: any) {
      clearTimeout(timer);
      const msg = err?.name === 'AbortError' ? `Request timed out after ${timeoutMs}ms` : `Fetch failed: ${err?.message ?? err}`;
      return fail(currentUrl, msg);
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return fail(currentUrl, `Redirect (${res.status}) with no Location header`);
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = nextUrl;
      continue; // re-validate safety of the new hop on the next loop iteration
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
      return { ok: false, status: res.status, statusText: res.statusText, headers: res.headers, finalUrl: currentUrl, body: '', truncated: true, error: 'Response too large' };
    }

    const { text, truncated } = await readBounded(res, maxBytes);

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      finalUrl: currentUrl,
      body: text,
      truncated,
    };
  }

  return fail(currentUrl, 'Too many redirects');
}

async function readBounded(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return { text: text.slice(0, maxBytes), truncated: text.length > maxBytes };
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        truncated = true;
        const remaining = maxBytes - (received - value.byteLength);
        if (remaining > 0) chunks.push(value.slice(0, remaining));
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
      chunks.push(value);
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buf.toString('utf-8'), truncated };
}

function fail(url: string, error: string): SafeFetchResult {
  return { ok: false, status: 0, statusText: 'error', headers: new Headers(), finalUrl: url, body: '', truncated: false, error };
}
