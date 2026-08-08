'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth';
import { useTheme } from '@/components/providers/theme';
import { useDebounced, useLockScroll } from '@/lib/hooks';
import { api } from '@/lib/api';
import { navItems } from './nav-items';
import { Avatar, Spinner } from '@/components/ui';
import { cx } from '@/lib/format';

interface SearchResults {
  projects: { id: string; name: string; key: string; color: string }[];
  tasks: { id: string; number: number; title: string; project: { key: string; color: string } }[];
  members: { user: { id: string; name: string; email: string; avatarUrl: string | null } }[];
  docs: { id: string; title: string; projectId: string }[];
  messages: { id: string; body: string; channelId: string; channel: { name: string } }[];
  files: { id: string; name: string; url: string }[];
}

interface Row {
  id: string;
  group: string;
  label: string;
  hint?: string;
  colour?: string;
  avatar?: { name: string; src: string | null };
  run: () => void;
}

/**
 * Cmd/Ctrl+K. Navigation entries are matched locally; everything else comes
 * from the permission-aware /api/search endpoint, so results never include
 * something the caller cannot open.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { workspaceId, can, user } = useAuth();
  const { toggle } = useTheme();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(query, 250);

  useLockScroll(open);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || debounced.trim().length < 2 || !workspaceId) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<SearchResults>(`/api/search?q=${encodeURIComponent(debounced.trim())}&limit=4`)
      .then(({ data }) => !cancelled && setResults(data))
      .catch(() => !cancelled && setResults(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, open, workspaceId]);

  const rows = useMemo<Row[]>(() => {
    if (!workspaceId) return [];
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const term = query.trim().toLowerCase();

    const navigation: Row[] = navItems(workspaceId)
      .filter((item) => !item.permission || can(item.permission))
      .filter((item) => !term || item.label.toLowerCase().includes(term))
      .map((item) => ({ id: `nav-${item.href}`, group: 'Go to', label: item.label, run: go(item.href) }));

    const actions: Row[] = [
      { id: 'act-theme', group: 'Actions', label: 'Toggle dark mode', run: () => { toggle(); onClose(); } },
      { id: 'act-new-project', group: 'Actions', label: 'New project', run: go(`/w/${workspaceId}/projects?new=1`) },
      { id: 'act-profile', group: 'Actions', label: 'Profile and security', run: go('/profile') },
      ...(user?.isPlatformAdmin ? [{ id: 'act-admin', group: 'Actions', label: 'Admin panel', run: go('/admin') }] : []),
    ].filter((row) => !term || row.label.toLowerCase().includes(term));

    const found: Row[] = results
      ? [
          ...results.projects.map((p) => ({ id: `p-${p.id}`, group: 'Projects', label: p.name, hint: p.key, colour: p.color, run: go(`/w/${workspaceId}/projects/${p.id}`) })),
          ...results.tasks.map((t) => ({ id: `t-${t.id}`, group: 'Tasks', label: t.title, hint: `${t.project.key}-${t.number}`, colour: t.project.color, run: go(`/w/${workspaceId}/tasks/${t.id}`) })),
          ...results.members.map((m) => ({ id: `m-${m.user.id}`, group: 'People', label: m.user.name, hint: m.user.email, avatar: { name: m.user.name, src: m.user.avatarUrl }, run: go(`/w/${workspaceId}/settings/members`) })),
          ...results.docs.map((d) => ({ id: `d-${d.id}`, group: 'Docs', label: d.title, run: go(`/w/${workspaceId}/docs/${d.id}`) })),
          ...results.messages.map((m) => ({ id: `msg-${m.id}`, group: 'Messages', label: m.body.slice(0, 70), hint: `#${m.channel.name}`, run: go(`/w/${workspaceId}/chat/${m.channelId}`) })),
          ...results.files.map((f) => ({ id: `f-${f.id}`, group: 'Files', label: f.name, run: () => { window.open(f.url, '_blank', 'noopener'); onClose(); } })),
        ]
      : [];

    return [...found, ...navigation, ...actions].slice(0, 28);
  }, [results, query, workspaceId, can, router, onClose, toggle, user]);

  useEffect(() => setCursor(0), [rows.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor((c) => Math.min(rows.length - 1, c + 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        rows[cursor]?.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, rows, cursor, onClose]);

  if (!open) return null;

  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-3 pt-[8vh] sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} tabIndex={-1} aria-label="Close" />
      <div className="slide-up relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-2 border-b px-3.5">
          <span className="text-[var(--text-faint)]">⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, docs, people — or jump to a page"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-[var(--text-faint)]"
            aria-label="Search"
          />
          {loading && <Spinner size={14} />}
          <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] sm:block">esc</kbd>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto py-1.5">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
              {query.trim().length < 2 ? 'Type at least two characters' : 'Nothing matched'}
            </p>
          ) : (
            rows.map((row, index) => {
              const header = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              return (
                <div key={row.id}>
                  {header && <p className="px-3.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{header}</p>}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={row.run}
                    className={cx('flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px]', index === cursor && 'bg-[var(--bg-inset)]')}
                  >
                    {row.avatar ? (
                      <Avatar name={row.avatar.name} src={row.avatar.src} size={20} />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.colour ?? 'var(--border-strong)' }} />
                    )}
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    {row.hint && <span className="shrink-0 text-[11px] text-[var(--text-faint)]">{row.hint}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden items-center gap-3 border-t px-3.5 py-2 text-[10px] text-[var(--text-faint)] sm:flex">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
