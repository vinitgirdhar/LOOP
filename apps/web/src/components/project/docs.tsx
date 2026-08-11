'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@/lib/hooks';
import { Button, Card, EmptyState, Field, Modal, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { WikiEditor } from './wiki-editor';

interface PageRow {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  isShared: boolean;
  version: number;
  updatedAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

interface PageDetail extends PageRow {
  content: string;
  projectId: string;
  _count: { versions: number };
}

export function ProjectDocs({ projectId, initialPageId }: { workspaceId: string; projectId: string; initialPageId?: string | null }) {
  const { can } = useAuth();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(initialPageId ?? null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  // The id can arrive after mount, once the URL has been read.
  useEffect(() => {
    if (initialPageId) setSelected(initialPageId);
  }, [initialPageId]);

  const { data: pages, loading, refetch } = useQuery<PageRow[]>(`/api/wiki?projectId=${projectId}`, [projectId]);
  const { data: page, refetch: refetchPage } = useQuery<PageDetail>(selected ? `/api/wiki/${selected}` : null, [selected]);
  const { data: versions } = useQuery<{ id: string; version: number; title: string; createdAt: string; author: { name: string } }[]>(
    showVersions && selected ? `/api/wiki/${selected}/versions` : null,
    [showVersions, selected],
  );

  if (loading && !pages) return <Skeleton className="h-64 w-full" />;

  const tree = (pages ?? []).filter((p) => !p.parentId);
  const childrenOf = (id: string) => (pages ?? []).filter((p) => p.parentId === id);

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
      <Card padded={false} className="h-fit">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-[13px] font-semibold">Pages</p>
          {can('wiki.write') && (
            <button type="button" onClick={() => setCreating(true)} className="btn btn-ghost btn-icon btn-sm" aria-label="New page">
              <Icon.plus width={14} height={14} />
            </button>
          )}
        </div>
        {tree.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">No pages yet</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1 lg:max-h-none">
            {tree.map((node) => (
              <li key={node.id}>
                <PageLink page={node} active={selected === node.id} onSelect={() => { setSelected(node.id); setEditing(false); }} />
                {childrenOf(node.id).map((child) => (
                  <PageLink key={child.id} page={child} nested active={selected === child.id} onSelect={() => { setSelected(child.id); setEditing(false); }} />
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        {!selected ? (
          <EmptyState
            title="Pick a page"
            description="Docs support rich text, markdown, code blocks, tables, nested pages and full version history."
            icon={<Icon.doc width={26} height={26} />}
            action={can('wiki.write') ? <Button variant="primary" size="sm" onClick={() => setCreating(true)}>New page</Button> : undefined}
          />
        ) : !page ? (
          <Skeleton className="h-64 w-full" />
        ) : editing ? (
          <WikiEditor
            page={page}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              void refetchPage();
              void refetch();
              toast.success('Page saved');
            }}
          />
        ) : (
          <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b pb-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-[-0.02em]">{page.title}</h2>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  v{page.version} · {page.author.name} · updated {relativeTime(page.updatedAt)}
                  {page.isShared && <span className="badge ml-1.5 bg-[var(--info-soft)] text-[var(--info)]">Shared with clients</span>}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => setShowVersions(true)}>
                  History
                </Button>
                {can('wiki.write') && (
                  <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                )}
              </div>
            </div>
            {page.content.trim() ? (
              <div className="prose-loop" dangerouslySetInnerHTML={{ __html: page.content }} />
            ) : (
              <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">This page is empty.</p>
            )}
          </Card>
        )}
      </div>

      <CreatePageModal
        open={creating}
        projectId={projectId}
        parents={pages ?? []}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setSelected(id);
          setEditing(true);
          void refetch();
        }}
      />

      <Modal open={showVersions} onClose={() => setShowVersions(false)} title="Version history">
        {!versions ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="divide-y">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    v{version.version} · {version.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {version.author.name} · {formatDateTime(version.createdAt)}
                  </p>
                </div>
                {can('wiki.write') && version.version !== page?.version && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await api.post(`/api/wiki/${selected}/restore/${version.version}`);
                        setShowVersions(false);
                        void refetchPage();
                        toast.success(`Restored v${version.version}`);
                      } catch (caught: unknown) {
                        toast.error(apiErrorMessage(caught));
                      }
                    }}
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function PageLink({ page, active, nested, onSelect }: { page: PageRow; active: boolean; nested?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${nested ? 'pl-7' : ''} ${
        active ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-inset)]'
      }`}
    >
      <Icon.doc width={13} height={13} className="shrink-0" />
      <span className="truncate">{page.title}</span>
      {page.isShared && <span className="ml-auto text-[9px] text-[var(--info)]">shared</span>}
    </button>
  );
}

function CreatePageModal({
  open,
  projectId,
  parents,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  parents: PageRow[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New page"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={title.trim().length < 1}
            onClick={async () => {
              setLoading(true);
              try {
                const { data } = await api.post<{ id: string }>('/api/wiki', {
                  projectId,
                  title: title.trim(),
                  ...(parentId ? { parentId } : {}),
                  isShared,
                });
                setTitle('');
                onCreated(data.id);
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Create page
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title" required>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Architecture overview" />
        </Field>
        <Field label="Nest under">
          <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Top level</option>
            {parents
              .filter((p) => !p.parentId)
              .map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.title}
                </option>
              ))}
          </select>
        </Field>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="block text-[13px] font-medium">Share with clients</span>
            <span className="block text-[11px] text-[var(--text-muted)]">
              Client accounts can only read pages marked shared — this also controls what the AI can retrieve for them.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

