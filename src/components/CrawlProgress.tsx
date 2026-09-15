'use client';

const STAGES: { key: string; label: string }[] = [
  { key: 'discovering', label: 'Discovering pages' },
  { key: 'crawling', label: 'Crawling website' },
  { key: 'extracting', label: 'Extracting metadata' },
  { key: 'analyzing', label: 'Analyzing content' },
  { key: 'organizing', label: 'Organizing pages' },
  { key: 'generating', label: 'Generating llms.txt' },
];

export interface CrawlProgressProps {
  stage: string | null;
  stageDetail: string | null;
  pagesDiscovered: number;
  pagesCrawled: number;
  hostname: string;
}

export function CrawlProgress({ stage, stageDetail, pagesDiscovered, pagesCrawled, hostname }: CrawlProgressProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);
  const doneIndex = stage === 'done' ? STAGES.length : currentIndex;

  return (
    <div className="mx-auto w-full max-w-lg animate-fade-up rounded-2xl border border-ink-950/10 bg-white/70 p-8 shadow-card backdrop-blur">
      <p className="text-center font-mono text-xs text-ink-950/40">{hostname}</p>
      <h2 className="mt-2 text-center font-display text-xl text-ink-950">Mapping the site…</h2>

      <ul className="mt-7 space-y-3.5">
        {STAGES.map((s, i) => {
          const isDone = i < doneIndex;
          const isCurrent = i === doneIndex;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] transition ${
                  isDone ? 'bg-moss text-white' : isCurrent ? 'bg-accent text-white' : 'bg-ink-950/8 text-ink-950/30'
                }`}
              >
                {isDone ? '✓' : isCurrent ? <PulseDot /> : ''}
              </span>
              <span className={`text-sm ${isDone ? 'text-ink-950/50 line-through decoration-ink-950/20' : isCurrent ? 'font-medium text-ink-950' : 'text-ink-950/35'}`}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-7 flex items-center justify-center gap-5 border-t border-ink-950/8 pt-5 font-mono text-xs text-ink-950/45">
        <span>{pagesDiscovered} discovered</span>
        <span className="h-1 w-1 rounded-full bg-ink-950/20" />
        <span>{pagesCrawled} crawled</span>
      </div>
      {stageDetail && <p className="mt-2 text-center text-xs text-ink-950/35">{stageDetail}</p>}
    </div>
  );
}

function PulseDot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" />;
}
