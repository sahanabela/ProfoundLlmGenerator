'use client';

import { useCallback, useEffect, useState } from 'react';
import { EXCLUSION_LABELS, type ExclusionReason } from '@/types';

interface EditorPage {
  id: string;
  url: string;
  markdownUrl: string | null;
  title: string;
  description: string;
  category: string;
  importanceScore: number;
  excludeReason: string | null;
  sectionOverride: string | null;
}

interface EditorSection {
  name: string;
  pages: EditorPage[];
}

interface RegenerateResult {
  content: string;
  stats: string | Record<string, unknown>;
  validation: unknown;
  version: number;
  createdAt: string;
}

const NEW_SECTION = '__new__';

export function EditablePreview({ websiteId, onSaved, onClose }: { websiteId: string; onSaved: (result: RegenerateResult) => void; onClose: () => void }) {
  const [sections, setSections] = useState<EditorSection[] | null>(null);
  const [excluded, setExcluded] = useState<EditorPage[] | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [movingPageId, setMovingPageId] = useState<string | null>(null);
  const [newSectionDraft, setNewSectionDraft] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/websites/${websiteId}/editor`, { cache: 'no-store' });
    const data = await res.json();
    setSections(data.sections ?? []);
    setExcluded(data.excluded ?? []);
  }, [websiteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchPage(pageId: string, body: { description?: string; section?: string | null; included?: boolean }) {
    setDirty(true);
    await fetch(`/api/websites/${websiteId}/pages/${pageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function handleRemove(pageId: string) {
    await patchPage(pageId, { included: false });
    await load();
  }

  async function handleRestore(pageId: string) {
    await patchPage(pageId, { included: true });
    await load();
  }

  async function handleDescriptionBlur(page: EditorPage, value: string) {
    if (value === page.description) return;
    await patchPage(page.id, { description: value });
  }

  async function handleMove(pageId: string, section: string) {
    setMovingPageId(null);
    await patchPage(pageId, { section });
    await load();
  }

  async function handleRenameSection(section: EditorSection, newName: string) {
    setRenamingSection(null);
    const trimmed = newName.trim();
    if (!trimmed || trimmed === section.name) return;
    setDirty(true);
    await Promise.all(section.pages.map((p) => patchPage(p.id, { section: trimmed })));
    await load();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/regenerate-file`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDirty(false);
        onSaved(data);
      }
    } finally {
      setSaving(false);
    }
  }

  const allSectionNames = sections?.map((s) => s.name) ?? [];

  if (!sections || !excluded) {
    return <div className="rounded-xl2 border border-ink-950/10 bg-white/60 p-8 text-center text-sm text-ink-950/40">Loading editor…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-950/45">
          Rename sections, move pages between them, edit descriptions, or remove pages — then save to regenerate the file.
        </p>
        <button onClick={onClose} className="shrink-0 text-xs font-medium text-ink-950/45 hover:text-ink-950">
          Back to preview
        </button>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.name} className="rounded-xl2 border border-ink-950/10 bg-white/60">
            <div className="flex items-center justify-between border-b border-ink-950/8 px-4 py-2.5">
              {renamingSection === section.name ? (
                <input
                  autoFocus
                  defaultValue={section.name}
                  onBlur={(e) => handleRenameSection(section, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenamingSection(null);
                  }}
                  className="rounded border border-ink-950/20 bg-white px-2 py-0.5 font-display text-sm text-ink-950 focus:outline-none"
                />
              ) : (
                <button onClick={() => setRenamingSection(section.name)} className="group flex items-center gap-1.5 font-display text-sm text-ink-950">
                  {section.name}
                  <span className="text-[10px] text-ink-950/0 group-hover:text-ink-950/35">✎</span>
                </button>
              )}
              <span className="font-mono text-xs text-ink-950/35">{section.pages.length}</span>
            </div>

            <ul className="divide-y divide-ink-950/6">
              {section.pages.map((page) => (
                <li key={page.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <a href={page.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-ink-950 hover:underline">
                        {page.title}
                      </a>
                    </div>
                    <p className="truncate font-mono text-[11px] text-ink-950/35">{page.url}</p>
                    <input
                      defaultValue={page.description}
                      onBlur={(e) => handleDescriptionBlur(page, e.target.value)}
                      placeholder="Add a short description…"
                      className="mt-1.5 w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-ink-950/70 transition hover:border-ink-950/10 focus:border-ink-950/20 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-start">
                    {movingPageId === page.id ? (
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value === NEW_SECTION) {
                            const name = window.prompt('New section name');
                            if (name?.trim()) handleMove(page.id, name.trim());
                            else setMovingPageId(null);
                          } else if (e.target.value) {
                            handleMove(page.id, e.target.value);
                          }
                        }}
                        onBlur={() => setMovingPageId(null)}
                        className="rounded-lg border border-ink-950/15 bg-white px-2 py-1 text-xs text-ink-950 focus:outline-none"
                      >
                        <option value="" disabled>
                          Move to…
                        </option>
                        {allSectionNames
                          .filter((n) => n !== section.name)
                          .map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        <option value={NEW_SECTION}>+ New section…</option>
                      </select>
                    ) : (
                      <button
                        onClick={() => setMovingPageId(page.id)}
                        className="rounded-lg border border-ink-950/12 px-2.5 py-1 text-xs font-medium text-ink-950/60 transition hover:border-ink-950/25 hover:text-ink-950"
                      >
                        Move
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(page.id)}
                      title="Remove from llms.txt"
                      className="rounded-lg border border-ink-950/12 px-2 py-1 text-xs text-ink-950/40 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
              {section.pages.length === 0 && <li className="px-4 py-3 text-xs text-ink-950/35">No pages in this section.</li>}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-xl2 border border-ink-950/10 bg-white/60">
        <button onClick={() => setShowExcluded((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink-950">
          Excluded pages ({excluded.length})
          <span className="text-ink-950/40">{showExcluded ? '−' : '+'}</span>
        </button>
        {showExcluded && (
          <ul className="divide-y divide-ink-950/6 border-t border-ink-950/8">
            {excluded.map((page) => (
              <li key={page.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-950/80">{page.title}</p>
                  <p className="truncate font-mono text-[11px] text-ink-950/35">
                    {page.url}
                    {page.excludeReason && <span className="ml-2 text-ink-950/30">· {EXCLUSION_LABELS[page.excludeReason as ExclusionReason] ?? page.excludeReason}</span>}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(page.id)}
                  className="shrink-0 rounded-lg border border-ink-950/12 px-2.5 py-1 text-xs font-medium text-ink-950/60 transition hover:border-moss/40 hover:text-moss"
                >
                  + Add back
                </button>
              </li>
            ))}
            {excluded.length === 0 && <li className="px-4 py-3 text-xs text-ink-950/35">Nothing excluded.</li>}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent disabled:opacity-50"
        >
          {saving ? 'Regenerating…' : 'Save & regenerate llms.txt'}
        </button>
        {dirty && !saving && <span className="text-xs text-ink-950/40">Edits saved — regenerate to update the file.</span>}
      </div>
    </div>
  );
}
