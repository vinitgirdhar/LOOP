'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useDebounced, useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { relativeTime } from '@/lib/format';

interface DocRow {
  id: string;
  title: string;
  projectId: string;
  isShared: boolean;
  version: number;
  updatedAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

export default function DocsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);

  const { data: docs, loading } = useQuery<DocRow[]>(`/api/wiki${debounced.trim() ? `?q=${encodeURIComponent(debounced.trim())}` : ''}`, [debounced, workspaceId]);
  const { data: projects } = useQuery<{ id: string; key: string; name: string; color: string }[]>('/api/projects', [workspaceId]);

  const byProject = (projects ?? []).map((project) => ({
    project,
    pages: (docs ?? []).filter((doc) => doc.projectId === project.id),
  }));

  return (
    <Page>
      <PageHeader title="Docs" subtitle="Every wiki page across the workspace. Open a project to edit." />

      <div className="relative mb-4 max-w-md">
        <Icon.search width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input className="input pl-9" placeholder="Search docs…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && !docs ? (
        <Skeleton className="h-64 w-full" />
      ) : (docs ?? []).length === 0 ? (
        <EmptyState
          title={debounced ? 'Nothing matched' : 'No documentation yet'}
          description="Docs live inside a project — open one and use the Docs tab."
          icon={<Icon.doc width={26} height={26} />}
        />
      ) : (
        <div className="space-y-4">
          {byProject.map(({ project, pages }) =>
            pages.length === 0 ? null : (
              <Card key={project.id} padded={false}>
                <div className="flex items-center gap-2 border-b px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: project.color }} />
                  <Link href={`/w/${workspaceId}/projects/${project.id}`} className="text-[13px] font-semibold hover:underline">
                    {project.name}
                  </Link>
                  <span className="text-[11px] text-[var(--text-faint)]">{pages.length} pages</span>
                </div>
                <ul className="divide-y">
                  {pages.map((page) => (
                    <li key={page.id}>
                      <Link href={`/w/${workspaceId}/projects/${page.projectId}?tab=docs`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--bg-inset)]">
                        <Icon.doc width={15} height={15} className="shrink-0 text-[var(--text-muted)]" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{page.title}</span>
                        {page.isShared && <span className="badge bg-[var(--info-soft)] text-[var(--info)]">shared</span>}
                        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                          v{page.version} · {page.author.name} · {relativeTime(page.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ),
          )}
        </div>
      )}
    </Page>
  );
}
