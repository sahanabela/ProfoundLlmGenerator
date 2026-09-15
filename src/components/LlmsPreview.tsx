'use client';

import { useState } from 'react';

export function LlmsPreview({ content, hostname }: { content: string; hostname: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  function handleDownload() {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'llms.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="overflow-hidden rounded-xl2 border border-ink-950/10 bg-ink-950 shadow-card">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="ml-2 font-mono text-xs text-white/40">{hostname}/llms.txt</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/15">
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button onClick={handleDownload} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/85">
            Download
          </button>
        </div>
      </div>
      <pre className="thin-scroll max-h-[480px] overflow-auto px-5 py-4 font-mono text-[13px] leading-relaxed text-white/85">{content}</pre>
    </div>
  );
}
