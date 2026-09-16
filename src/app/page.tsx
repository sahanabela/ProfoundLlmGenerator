'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';

const EXAMPLE_SITES = ['stripe.com', 'vercel.com', 'anthropic.com'];

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    const candidate = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;

    try {
      const res = await fetch('/api/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: candidate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        setLoading(false);
        return;
      }
      router.push(`/site/${data.websiteId}`);
    } catch {
      setError('Could not reach the server. Please try again.');
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-[0.35]" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6">
        <header className="flex items-center justify-between py-8">
          <BrandLockup />
          <nav className="flex items-center gap-4">
            <Link href="/library" className="text-xs font-medium text-ink-950/50 transition hover:text-ink-950">
              Library
            </Link>
            <a
              href="https://llmstxt.org/"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-ink-950/10 px-3.5 py-1.5 text-xs font-medium text-ink-950/60 transition hover:border-ink-950/20 hover:text-ink-950"
            >
              llms.txt spec ↗
            </a>
          </nav>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-10 pb-24 pt-8 text-center">
          <div className="animate-fade-up space-y-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-moss-soft px-3 py-1 text-xs font-medium text-moss">
              <span className="h-1.5 w-1.5 rounded-full bg-moss animate-pulse-dot" />
              Built for the llms.txt v2 spec
            </span>
            <h1 className="text-balance font-display text-4xl leading-[1.08] tracking-tight text-ink-950 sm:text-6xl">
              Give AI agents a map of your site, <em className="italic text-accent">not a sitemap</em>.
            </h1>
            <p className="mx-auto max-w-xl text-balance text-base leading-relaxed text-ink-950/60 sm:text-lg">
              Enter a website and Waypoint discovers its structure, extracts what actually matters, and curates a
              clean <code className="rounded bg-ink-950/5 px-1.5 py-0.5 font-mono text-[0.85em]">llms.txt</code> — then
              keeps it fresh as the site changes.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-xl animate-fade-up" style={{ animationDelay: '80ms' }}>
            <div className="flex flex-col gap-3 rounded-2xl border border-ink-950/10 bg-white/70 p-2 shadow-card backdrop-blur sm:flex-row">
              <div className="flex flex-1 items-center gap-2 rounded-xl px-3.5 py-2.5">
                <span className="font-mono text-sm text-ink-950/35">https://</span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  autoFocus
                  className="w-full bg-transparent font-mono text-sm text-ink-950 placeholder:text-ink-950/30 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="group flex items-center justify-center gap-2 rounded-xl bg-ink-950 px-5 py-3 text-sm font-medium text-paper-50 transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Spinner /> Starting…
                  </>
                ) : (
                  <>
                    Generate llms.txt
                    <span className="transition group-hover:translate-x-0.5">→</span>
                  </>
                )}
              </button>
            </div>
            {error && <p className="mt-3 text-left text-sm text-red-600">{error}</p>}
            <p className="mt-4 text-xs text-ink-950/40">
              Try{' '}
              {EXAMPLE_SITES.map((site, i) => (
                <span key={site}>
                  <button type="button" onClick={() => setUrl(site)} className="underline decoration-dotted underline-offset-2 hover:text-ink-950">
                    {site}
                  </button>
                  {i < EXAMPLE_SITES.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </form>

          <div className="grid w-full max-w-3xl grid-cols-1 gap-4 animate-fade-up sm:grid-cols-3" style={{ animationDelay: '140ms' }}>
            <FeatureCard title="Curated, not exhaustive" body="Ranks and filters pages so agents get signal, not 5,000 links." />
            <FeatureCard title="Change-aware" body="Hashes meaningful content and regenerates only when it actually changes." />
            <FeatureCard title="Transparent" body="Shows exactly what was excluded, and why — duplicates, logins, thin pages." />
          </div>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl2 border border-ink-950/10 bg-white/60 p-4 text-left shadow-card backdrop-blur">
      <p className="font-display text-sm text-ink-950">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-950/55">{body}</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-paper-50" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
