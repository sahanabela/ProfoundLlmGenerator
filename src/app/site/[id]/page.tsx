'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CrawlProgress } from '@/components/CrawlProgress';
import { BrandLockup } from '@/components/BrandLockup';
import { WebsiteStats, type GeneratedStats } from '@/components/WebsiteStats';
import { LlmsPreview } from '@/components/LlmsPreview';
import { EditablePreview } from '@/components/EditablePreview';
import { MonitoringToggle } from '@/components/MonitoringToggle';
import { formatHostname, formatRelativeTime } from '@/lib/format';
import type { MonitoringFrequency } from '@/types';

interface Website {
  id: string;
  baseUrl: string;
  normalizedUrl: string;
  siteName: string | null;
  siteDescription: string | null;
  monitoringEnabled: boolean;
  monitoringFrequency: MonitoringFrequency;
  lastCrawledAt: string | null;
  nextScheduledCrawlAt: string | null;
  existingLlmsTxtContent: string | null;
  robotsDisallowedPaths: string | null;
}

interface Crawl {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stage: string | null;
  stageDetail: string | null;
  pagesDiscovered: number;
  pagesCrawled: number;
  error: string | null;
}

interface GeneratedFile {
  content: string;
  version: number;
  stats: string;
  createdAt: string;
}

export default function SitePage() {
  const params = useParams<{ id: string }>();
  const websiteId = params.id;

  const [website, setWebsite] = useState<Website | null>(null);
  const [crawl, setCrawl] = useState<Crawl | null>(null);
  const [generatedFile, setGeneratedFile] = useState<GeneratedFile | null>(null);
  const [showExisting, setShowExisting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/websites/${websiteId}/status`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setWebsite(data.website);
    setCrawl(data.crawl);
    if (data.generatedFile) setGeneratedFile(data.generatedFile);

    const inFlight = data.crawl && (data.crawl.status === 'pending' || data.crawl.status === 'running');
    pollRef.current = setTimeout(poll, inFlight ? 1200 : 8000);
  }, [websiteId]);

  useEffect(() => {
    poll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [poll]);

  async function handleRegenerate() {
    setRegenerating(true);
    await fetch(`/api/websites/${websiteId}/generate`, { method: 'POST' });
    setRegenerating(false);
    if (pollRef.current) clearTimeout(pollRef.current);
    poll();
  }

  if (!website) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-ink-950/40">
        Loading…
      </main>
    );
  }

  const hostname = formatHostname(website.normalizedUrl);
  const inProgress = crawl && (crawl.status === 'pending' || crawl.status === 'running');
  const failed = crawl && crawl.status === 'failed';
  const stats: GeneratedStats | null = generatedFile ? JSON.parse(generatedFile.stats) : null;
  const robotsBlocked: string[] = website.robotsDisallowedPaths ? JSON.parse(website.robotsDisallowedPaths) : [];

  return (
    <main className="relative min-h-screen pb-24">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-[0.25]" />

      <div className="relative mx-auto max-w-3xl px-6">
        <header className="flex items-center justify-between py-8">
          <Link href="/">
            <BrandLockup />
          </Link>
          <nav className="flex items-center gap-4 text-xs font-medium text-ink-950/45">
            <Link href="/library" className="hover:text-ink-950">
              Library
            </Link>
            <Link href="/" className="hover:text-ink-950">
              ← Analyze another site
            </Link>
          </nav>
        </header>

        {inProgress && (
          <div className="flex min-h-[60vh] items-center justify-center">
            <CrawlProgress
              stage={crawl?.stage ?? 'discovering'}
              stageDetail={crawl?.stageDetail ?? null}
              pagesDiscovered={crawl?.pagesDiscovered ?? 0}
              pagesCrawled={crawl?.pagesCrawled ?? 0}
              hostname={hostname}
            />
          </div>
        )}

        {failed && (
          <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-display text-lg text-red-700">The crawl couldn't finish</p>
            <p className="mt-2 text-sm text-red-600">{crawl?.error ?? 'An unexpected error occurred.'}</p>
            <button onClick={handleRegenerate} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              Try again
            </button>
          </div>
        )}

        {!inProgress && !failed && generatedFile && stats && (
          <div className="animate-fade-up space-y-8 pt-4">
            <div>
              <p className="font-mono text-xs text-ink-950/40">{website.normalizedUrl}</p>
              <h1 className="mt-1 font-display text-3xl tracking-tight text-ink-950">{website.siteName}</h1>
              {website.siteDescription && <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-950/55">{website.siteDescription}</p>}
            </div>

            {robotsBlocked.length > 0 && (
              <p className="rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                We respected <code className="font-mono">robots.txt</code>: {robotsBlocked.length} path pattern{robotsBlocked.length === 1 ? '' : 's'} were
                off-limits, e.g. <code className="font-mono">{robotsBlocked[0]}</code>.
              </p>
            )}

            <WebsiteStats stats={stats} lastCrawledAt={website.lastCrawledAt} />

            {mode === 'preview' ? (
              <>
                <LlmsPreview content={generatedFile.content} hostname={hostname} />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent disabled:opacity-50"
                  >
                    {regenerating ? 'Starting…' : 'Regenerate now'}
                  </button>
                  <button
                    onClick={() => setMode('edit')}
                    className="rounded-lg border border-ink-950/15 px-4 py-2.5 text-sm font-medium text-ink-950/70 transition hover:border-ink-950/30 hover:text-ink-950"
                  >
                    Edit sections & pages
                  </button>
                  <span className="text-xs text-ink-950/35">v{generatedFile.version} · generated {formatRelativeTime(generatedFile.createdAt)}</span>
                </div>
              </>
            ) : (
              <EditablePreview
                websiteId={website.id}
                onClose={() => setMode('preview')}
                onSaved={(result) => {
                  setGeneratedFile({
                    content: result.content,
                    version: result.version,
                    stats: typeof result.stats === 'string' ? result.stats : JSON.stringify(result.stats),
                    createdAt: result.createdAt,
                  });
                  setMode('preview');
                }}
              />
            )}

            <MonitoringToggle
              websiteId={website.id}
              enabled={website.monitoringEnabled}
              frequency={website.monitoringFrequency}
              nextScheduledCrawlAt={website.nextScheduledCrawlAt}
              onChanged={(data) =>
                setWebsite((w) => (w ? { ...w, monitoringEnabled: data.monitoringEnabled, monitoringFrequency: data.monitoringFrequency, nextScheduledCrawlAt: data.nextScheduledCrawlAt } : w))
              }
            />

            {website.existingLlmsTxtContent && (
              <div className="rounded-xl2 border border-ink-950/10 bg-white/60 p-5">
                <button onClick={() => setShowExisting((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-medium text-ink-950">
                  This site already publishes an llms.txt
                  <span className="text-ink-950/40">{showExisting ? '−' : '+'}</span>
                </button>
                {showExisting && (
                  <pre className="thin-scroll mt-3 max-h-64 overflow-auto rounded-lg bg-ink-950/5 p-4 font-mono text-xs leading-relaxed text-ink-950/70">
                    {website.existingLlmsTxtContent}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
