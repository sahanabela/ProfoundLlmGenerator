// Optional Playwright fallback for pages that render almost all of their
// content client-side. Used only when the plain HTTP fetch produced an
// "empty shell" page — see extractor/content.ts#looksLikeEmptyShell.
//
// Playwright is an optionalDependency and its browsers are NOT auto-installed
// (see .npmrc / README). If the package or a browser binary isn't available,
// this fails soft and the caller just keeps the lightweight HTML it already has.

let playwrightAvailable: boolean | null = null;

export async function renderWithPlaywright(url: string, timeoutMs: number): Promise<string | null> {
  if (playwrightAvailable === false) return null;

  // Only a missing package or a browser that won't launch means Playwright
  // is genuinely unavailable — cache that so we stop trying for the rest of
  // this process. A single page failing to render (timeout, nav error) is
  // that page's problem, not Playwright's, so it must not disable the
  // fallback for every other page in the crawl.
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    playwrightAvailable = false;
    return null;
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    playwrightAvailable = false;
    return null;
  }
  playwrightAvailable = true;

  try {
    const page = await browser.newPage();
    await page.goto(url, { timeout: timeoutMs, waitUntil: 'networkidle' });
    return await page.content();
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}
