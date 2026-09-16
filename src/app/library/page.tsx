'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatHostname, formatRelativeTime } from '@/lib/format';
import type { MonitoringFrequency } from '@/types';
import { BrandLockup } from '@/components/BrandLockup';

interface LibraryFile {
  websiteId: string;
  siteName: string | null;
  normalizedUrl: string;
  monitoringEnabled: boolean;
  monitoringFrequency: MonitoringFrequency;
  version: number;
  stats: string | null;
  generatedAt: string;
}

export default function LibraryPage() {
  const [files, setFiles] = useState<LibraryFile[] | null>(null);

  useEffect(() => {
    fetch('/api/files', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setFiles(data.files ?? []))
      .catch(() => setFiles([]));
  }, []);

  return (
    <main className="relative min-h-screen pb-24">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-[0.25]" />

      <div className="relative mx-auto max-w-5xl px-6">
        <header className="flex items-center justify-between py-8">
          <Link href="/">
            <BrandLockup />
          </Link>
          <nav className="flex items-center gap-5 text-xs font-medium text-ink-950/45">
            <span className="text-ink-950">Library</span>
            <Link href="/" className="hover:text-ink-950">
              + New site
            </Link>
          </nav>
        </header>

        <div className="animate-fade-up">
          <h1 className="font-display text-3xl tracking-tight text-ink-950">Generated files</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-950/55">
            Every site you&rsquo;ve generated an <code className="rounded bg-ink-950/5 px-1.5 py-0.5 font-mono text-[0.85em]">llms.txt</code> for, with its
            current version and when it was last regenerated.
          </p>

          <div className="mt-8 overflow-hidden rounded-xl2 border border-ink-950/10 bg-white/60 shadow-card">
            {files === null && <SkeletonRows />}
            {files !== null && files.length === 0 && <EmptyState />}
            {files !== null && files.length > 0 && <FilesTable files={files} />}
          </div>
        </div>
      </div>
    </main>
  );
}

function FilesTable({ files }: { files: LibraryFile[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-950/10 text-xs uppercase tracking-wide text-ink-950/40">
            <th className="px-5 py-3 font-medium">Site</th>
            <th className="px-5 py-3 font-medium">Included</th>
            <th className="px-5 py-3 font-medium">Version</th>
            <th className="px-5 py-3 font-medium">Last updated</th>
            <th className="px-5 py-3 font-medium">Monitoring</th>
            <th className="px-5 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const stats = file.stats ? safeParse(file.stats) : null;
            const hostname = formatHostname(file.normalizedUrl);
            return (
              <tr key={file.websiteId} className="border-b border-ink-950/5 last:border-0 hover:bg-ink-950/[0.02]">
                <td className="px-5 py-4">
                  <Link href={`/site/${file.websiteId}`} className="block">
                    <p className="font-medium text-ink-950">{file.siteName || hostname}</p>
                    <p className="font-mono text-xs text-ink-950/40">{hostname}</p>
                  </Link>
                </td>
                <td className="px-5 py-4 text-ink-950/70">{stats?.included ?? '—'}</td>
                <td className="px-5 py-4 font-mono text-xs text-ink-950/50">v{file.version}</td>
                <td className="px-5 py-4 text-ink-950/60">{formatRelativeTime(file.generatedAt)}</td>
                <td className="px-5 py-4">
                  {file.monitoringEnabled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-moss-soft px-2.5 py-1 text-xs font-medium text-moss">
                      <span className="h-1.5 w-1.5 rounded-full bg-moss" />
                      {file.monitoringFrequency}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-950/35">Off</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/site/${file.websiteId}`}
                      className="rounded-lg border border-ink-950/12 px-3 py-1.5 text-xs font-medium text-ink-950/70 transition hover:border-ink-950/25 hover:text-ink-950"
                    >
                      View
                    </Link>
                    <a
                      href={`/api/websites/${file.websiteId}/llms.txt`}
                      download
                      className="rounded-lg bg-ink-950 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent"
                    >
                      Download
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-8 py-16 text-center">
      <p className="font-display text-lg text-ink-950">No files generated yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-950/50">Generate your first llms.txt and it&rsquo;ll show up here.</p>
      <Link href="/" className="mt-5 inline-block rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent">
        Generate llms.txt
      </Link>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-ink-950/5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-8 w-40 animate-pulse rounded bg-ink-950/5" />
          <div className="h-4 w-12 animate-pulse rounded bg-ink-950/5" />
          <div className="ml-auto h-4 w-24 animate-pulse rounded bg-ink-950/5" />
        </div>
      ))}
    </div>
  );
}

function safeParse(json: string): { included?: number } | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
