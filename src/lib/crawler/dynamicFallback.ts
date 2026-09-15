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

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    playwrightAvailable = true;
    try {
      const page = await browser.newPage();
      await page.goto(url, { timeout: timeoutMs, waitUntil: 'networkidle' });
      const html = await page.content();
      return html;
    } finally {
      await browser.close();
    }
  } catch {
    playwrightAvailable = false;
    return null;
  }
}
