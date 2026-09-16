# Waypoint by Profound — automated llms.txt generator

> A demo product concept built as an extension of [Profound](https://www.tryprofound.com/) — a curated llms.txt
> generator and monitor for the AI-visibility era. Not an official Profound product.

Point Waypoint at a website and it discovers the site's structure, crawls the pages that matter, and curates a
concise, spec-compliant [`llms.txt`](https://llmstxt.org/) file — a small, high-signal map of the site for AI
agents, not a 5,000-line sitemap dump. It then persists everything it learned, can re-crawl the site on a
schedule, detects what changed, and regenerates the file automatically.

Built against the **llms.txt v2 spec** (llmstxt.org, updated August 2026) — treated as the source of truth over
older v1-era tutorials. v2's two notable changes this project leans on: markdown alternates can be discovered via
either `page.html.md` or extension-replacement (`page.md`), and `Optional` is a naming convention rather than a
tool with special mechanical meaning.

## Project overview

Give it a URL:

```
https://example.com
```

and it will:

1. **Discover** the site's important pages (sitemap first, breadth-first link crawling as a fallback/supplement).
2. **Extract** metadata and main content from each page (title, description, headings, canonical/markdown URLs).
3. **Analyze** each page deterministically (and optionally with an LLM for ambiguous cases) — category, importance,
   a concise description, and an include/exclude decision.
4. **Filter** out duplicates, thin pages, navigation chrome, auth flows, tracking URLs, and pagination.
5. **Organize** what's left into a small number of meaningful sections (Documentation, Guides, API Reference, …)
   and curate down to a page-count budget, demoting low-importance pages into `Optional`.
6. **Generate** a deterministic, validated `llms.txt` — rendered from a structured intermediate representation,
   never freeform LLM output.
7. **Persist** the whole crawl (pages, hashes, scores, categories, generated versions) to SQLite.
8. **Monitor** the site on a schedule (manual / daily / weekly), detect added/changed/removed pages by content
   hash, and **regenerate** the file automatically when something meaningful changes.

## Architecture

```
                    User
                      │
                      ▼
                 Web App (Next.js App Router)
                      │
                      ▼
                 API Layer  (src/app/api/websites/...)
                      │
                      ▼
               Website Analyzer (src/lib/pipeline.ts)
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      Discovery    Extraction   Analysis
   (crawler/*)   (extractor/*) (analyzer/*)
          │           │           │
          └───────────┼───────────┘
                      │
                      ▼
              llms.txt Generator  (generator/*)
                      │
              ┌───────┴────────┐
              ▼                ▼
      Database (SQLite)   Generated File
        (db/*, Prisma)     (versioned)
                      │
                      ▼
                  Monitoring  (monitoring/*)
             scheduler + diff + re-crawl
```

Logical pipeline inside the analyzer (`src/lib/pipeline.ts`), mirroring the phases below:

```
URL Submission → Generation API → Website Analyzer
                                        │
                     ┌──────────────────┼───────────────────┐
                     ▼                  ▼                   ▼
                Discovery           Extraction            Analysis
          (sitemap + BFS crawl)  (metadata + content   (classify + score +
           robots.txt-aware      + markdown discovery)   filter + optional LLM)
                     └──────────────────┼───────────────────┘
                                        ▼
                                   Page Model
                                        ▼
                          Ranking + Filtering + Section
                             Organization (curation cap)
                                        ▼
                              llms.txt Generator
                             (structured doc → Markdown)
                                        ▼
                                  Validation
                                        ▼
                                  Persistence
                                        ▼
                              Preview / Download
                                        ▼
                                  Monitoring
                        (scheduled re-crawl → diff → regenerate)
```

### Code layout

```
src/
  app/
    page.tsx                 URL input hero
    site/[id]/page.tsx        progress + results workspace
    api/websites/...          REST-ish API routes
  components/                 UrlForm-equivalent hero, CrawlProgress, WebsiteStats,
                               LlmsPreview, MonitoringToggle
  lib/
    crawler/                  discover.ts (priority), crawler.ts, robots.ts, sitemap.ts,
                               normalizeUrl.ts, dynamicFallback.ts (Playwright)
    extractor/                metadata.ts, content.ts, markdownDiscovery.ts
    analyzer/                 classify.ts, importance.ts, filter.ts, llm.ts
    generator/                sections.ts, generateLlmsTxt.ts, validateLlmsTxt.ts,
                               siteMetadata.ts, existingLlmsTxt.ts
    monitoring/                diff.ts, scheduler.ts
    security/                  ssrf.ts, safeFetch.ts
    db/                        client.ts, repository.ts (Prisma)
    pipeline.ts                orchestrates all of the above
  scripts/runScheduler.ts      standalone monitoring scheduler process
  types/                       shared domain types
prisma/schema.prisma           Website / Page / GeneratedFile / Crawl / ChangeEvent
```

## Setup

```bash
npm install
cp .env.example .env   # already done if you cloned this repo as-is
npm run db:push         # create the SQLite database from the Prisma schema
npm run dev              # http://localhost:3000
```

Run the test suite:

```bash
npm test
```

Optional: run the monitoring scheduler in a second terminal (see "How updates work" below):

```bash
npm run scheduler
```

## Environment variables

```
DATABASE_URL=              # SQLite file, relative to prisma/schema.prisma (default: file:./dev.db → prisma/dev.db)
ANTHROPIC_API_KEY=         # optional — enables LLM classification for ambiguous pages. App works fully without it.
ANTHROPIC_MODEL=           # optional, defaults to claude-haiku-4-5-20251001
CRAWL_MAX_PAGES=100        # crawl budget per site
CRAWL_MAX_DEPTH=5
CRAWL_CONCURRENCY=5
CRAWL_REQUEST_TIMEOUT_MS=10000
SCHEDULER_POLL_INTERVAL_MS=300000   # only used by `npm run scheduler`
```

**The app works with zero LLM configuration.** Deterministic URL/title/heading heuristics are the primary and
only-required classification path; an LLM (when `ANTHROPIC_API_KEY` is set) is used strictly as a fallback for
pages the deterministic rules couldn't confidently categorize, and every response is validated against a strict
schema (via forced tool-use) before it's trusted.

> Note on `DATABASE_URL`: Prisma resolves a relative sqlite path relative to `prisma/schema.prisma`, not the
> project root. `file:./dev.db` therefore correctly means `prisma/dev.db` — don't change it to
> `file:./prisma/dev.db`, which resolves to a confusing `prisma/prisma/dev.db`.

## How crawling works

1. **robots.txt** is fetched and parsed first (`lib/crawler/robots.ts`). Disallowed paths are never queued, and
   the count/sample of blocked paths is surfaced in the UI ("We respected robots.txt: N paths were off-limits...").
2. **Sitemap discovery** (`lib/crawler/sitemap.ts`): checks `robots.txt`'s `Sitemap:` entries plus the conventional
   `/sitemap.xml` and `/sitemap_index.xml` locations, following sitemap indexes one level.
3. **Breadth-first link crawling** seeds from the homepage and every sitemap URL, then expands via internal links
   found on each fetched page — this runs *in addition to* sitemap discovery (not only as a fallback), since
   sitemaps are frequently incomplete.
4. **URL normalization** (`lib/crawler/normalizeUrl.ts`) strips fragments, drops known tracking params, normalizes
   trailing slashes/ports/case, and rejects `mailto:`/`tel:`/`javascript:`/binary-asset URLs before they're ever
   queued — this is also the de-dup key for the `visited` set.
5. **Discovery-time exclusion**: URLs that clearly look like auth flows, search/pagination, or low-priority utility
   pages (cart, legal, cookies) are classified and counted as excluded *without being fetched* — this keeps the
   crawler polite and fast, and still keeps the exclusion reason transparent in the UI.
6. **Crawl limits** (`CRAWL_MAX_PAGES` / `CRAWL_MAX_DEPTH` / `CRAWL_REQUEST_TIMEOUT_MS`) are enforced throughout;
   a priority queue (`lib/crawler/priority.ts`) spends the budget on likely-important paths first (`/docs`,
   `/guide`, `/api`, …) rather than crawling in arbitrary order.
7. **Bounded concurrency** (`CRAWL_CONCURRENCY`, via `p-limit`) — never an unbounded `Promise.all`.
8. **SSRF protections** (`lib/security/ssrf.ts`, `safeFetch.ts`): http(s)-only, rejects `localhost`/loopback/
   private/link-local/reserved IPs (including the cloud metadata address) both for the literal input URL and for
   every redirect hop, enforces a request timeout, and caps response size.
9. **Dynamic page fallback**: pages are fetched with a plain HTTP request first. Only if the extracted text looks
   like an empty SPA shell does Waypoint fall back to Playwright (`lib/crawler/dynamicFallback.ts`) — and only if
   the `playwright` package and a browser binary are actually installed (it's an optional dependency; see below).

## How analysis works

1. **Deterministic classification first** (`lib/analyzer/classify.ts`): URL path patterns (`/docs`, `/api`,
   `/guides`, `/pricing`, …), then title/heading keyword matching as a second pass.
2. **Importance scoring** (`lib/analyzer/importance.ts`): a simple weighted sum — homepage bonus, category weight,
   depth penalty, inbound-internal-link bonus, content-length signal. Deliberately unsophisticated; the goal is
   just to avoid a 5,000-page site producing a 5,000-line file.
3. **Content filtering** (`lib/analyzer/filter.ts`): duplicate-content detection via content hash (keeps the
   highest-importance copy), thin-content pages, and navigation-only pages (e.g. a lone "Sitemap" page).
4. **Optional LLM layer** (`lib/analyzer/llm.ts`) — only called for pages the deterministic classifier flagged as
   ambiguous, batched (12 pages/request) to control cost, using Anthropic tool-use with a strict schema so a
   malformed/hallucinated response can never silently corrupt a page's category.
5. **Section organization + curation** (`lib/generator/sections.ts`): groups by category into a handful of H2
   sections, caps pages per section and overall, and demotes low-importance or overflow pages into `Optional`
   rather than dropping them outright when there's room.
6. **Generic-description detection**: some sites (common on docs generators) reuse one site-wide
   `<meta name="description">` on every page. If the same description appears on a large share of crawled pages,
   Waypoint treats it as boilerplate and falls back to that page's first real paragraph instead — filtering out
   paragraphs inside "tip"/callout/banner boxes, which are themselves often generic across pages.

## How updates work

1. **Content hashing** (`lib/hash.ts`): SHA-256 of normalized (`title + description + main content`), not raw
   HTML — so incidental churn (timestamps, analytics IDs, ad slots) never triggers a false "page changed" signal.
2. **Scheduling** (`lib/monitoring/scheduler.ts`): `manual` / `daily` / `weekly`, stored per-website. A
   `LocalPollingScheduler` (run via `npm run scheduler`) polls the DB for due websites — a deliberately simple
   stand-in for a real job queue, behind a small `Scheduler` interface so it can be swapped later.
3. **Change detection** (`lib/monitoring/diff.ts`): added (new URL), changed (same URL, different content hash),
   removed. A page missing from one crawl gets a `missingSince` grace period rather than immediate deletion — it's
   only marked removed if it's *still* missing on the following crawl, so a single transient fetch failure can't
   delete a page from the map.
4. **Incremental re-analysis**: if a page's content hash is unchanged since the last crawl, its stored category /
   importance / inclusion decision is reused as-is — it is not re-classified and never re-sent to the LLM.
5. **Full regeneration from current state**: the file itself is always regenerated in full from the current set of
   included pages, rather than patched — simpler and safer than diffing Markdown text.

## Security

The app accepts arbitrary user-supplied URLs, so basic SSRF hygiene is built in (see `lib/security/`): http/https
only, blocks loopback/private/link-local/reserved IPv4 and IPv6 ranges (including the AWS/GCP metadata address)
both up front and on every redirect hop, DNS-resolves the hostname before fetching, enforces request timeouts, and
caps response body size. This is intentionally *not* enterprise-grade (no DNS-rebinding pinning, no egress proxy) —
see Tradeoffs.

## Tradeoffs

- **SQLite** is appropriate for local/demo usage and keeps setup to zero external services; a production
  multi-tenant deployment would want Postgres.
- **Periodic polling** is simpler and easier to reason about than a push-based/webhook change-detection system,
  at the cost of latency between a real change and detection.
- **Deterministic-first classification** keeps the app fully functional with no API key and keeps LLM spend
  proportional to how ambiguous a site's URLs/titles actually are, not its page count.
- **Playwright is a true fallback**, not a default: browser rendering is slow and heavy, so it's only invoked for
  pages that look like an empty SPA shell after a plain HTTP fetch — and it's an `optionalDependency` (browser
  binaries aren't auto-installed; see below) so a fresh `npm install` stays fast.
- **Crawl limits are hard caps** (`CRAWL_MAX_PAGES`, `CRAWL_MAX_DEPTH`), not soft suggestions — this app will never
  attempt to crawl an unbounded site, by design.
- **In-process background jobs**: the crawl pipeline runs fire-and-forget inside the Next.js server process rather
  than a real job queue, which works because `next dev`/`next start` is a long-lived Node process. This would need
  to change (e.g. a real queue) behind a serverless/edge deployment where a request's process can be frozen or
  recycled after the response is sent.
- **llms.txt is generated deterministically from a structured intermediate representation**, never as freeform LLM
  output — the LLM (when used) only ever returns small, schema-validated JSON fields (category/importance/
  description/include) that feed into that structure.
- **Curation over completeness**: the generator caps pages per section and overall and actively demotes/drops
  lower-importance pages rather than listing everything discovered — matching the spec's intent that llms.txt is a
  curated map, not a sitemap.

## API

```
POST   /api/websites                    { url } → { websiteId }  (kicks off a crawl)
GET    /api/websites                    list recent websites
GET    /api/websites/:id                website + latest crawl + latest generated file
GET    /api/websites/:id/status         poll target for crawl progress + result
POST   /api/websites/:id/generate       trigger a (re)crawl
GET    /api/websites/:id/llms.txt       download the latest generated file (text/markdown)
GET    /api/websites/:id/pages          all discovered pages with category/importance/exclusion reason
GET    /api/websites/:id/changes        change history (added/changed/removed)
PATCH  /api/websites/:id/monitoring     { enabled, frequency }
GET    /api/websites/:id/editor         pages grouped by section, as they'll render, + excluded pages (Editable Preview)
PATCH  /api/websites/:id/pages/:pageId  { description?, section?, included? } — one manual edit
POST   /api/websites/:id/regenerate-file  rebuild llms.txt from current (edited) Page rows, no recrawl
GET    /api/files                       every website's current generated file, for the Library table
```

## Testing

`npm test` runs the Vitest suite (87 tests) covering URL normalization, internal/external + binary-asset
detection, robots.txt parsing/precedence, sitemap + sitemap-index parsing (mocked HTTP), SSRF IP-range checks,
deterministic classification, importance scoring, content filtering (duplicates/thin-content/navigation), section
organization/curation caps, llms.txt generation + validation, and change diffing. No real network access is
required for any test.

## Nice-to-have features implemented

- **Editable Preview** — automatic curation is never perfect, so the "Edit sections & pages" view lets you rename a
  section (renames it for every page currently in it), move a page to any section — existing or brand new — edit
  its description inline, or remove/re-add a page, then "Save & regenerate" rebuilds the file from that edited
  state without recrawling. A manually-placed page bypasses the normal per-section curation cap (it's an explicit
  choice); everything else keeps going through the same automatic cap-and-overflow-to-Optional logic used right
  after a crawl — including re-curating on save, so freeing up a slot (by moving or removing a page) can pull
  another page back in from Optional. Edits are stored per-page (`Page.sectionOverride`) and survive re-crawling as
  long as that page's content hasn't changed, the same way cached category/description do (see "How updates work").
- **Existing `/llms.txt` detection** — checked once per site; shown in the UI, expandable, for comparison.
- **Transparent exclusion reporting** — every excluded page is bucketed by reason (duplicate, auth, thin-content,
  navigation, tracking, pagination, robots-blocked, below the curation cutoff, removed manually, …) and shown in
  the UI.
- **Change history** — every added/changed/removed page is recorded as a `ChangeEvent` (`GET /:id/changes`).
- **robots.txt transparency** — a banner tells the user how many paths were off-limits and why.

### Known limitation

Homepage detection (used to fold the root page into the H1/summary instead of listing it as a link) compares the
crawled page's origin against the website's original input origin. A site that redirects its root to a different
domain (e.g. `vitejs.dev` → `vite.dev`) can slip past that check and show up as a normal link instead. Pre-existing
behavior, not introduced by the editor — noted here rather than silently patched, since a robust fix (e.g. tracking
the *actual* seed URL's final redirected origin per crawl) is a small, separate, focused change.
