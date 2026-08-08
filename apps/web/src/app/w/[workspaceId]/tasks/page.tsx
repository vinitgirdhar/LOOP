'use client';

import { use } from 'react';
import { DEFAULT_COLUMNS } from '@loop/shared';
import { Page, PageHeader } from '@/components/page';
import { TaskListTable } from '@/components/board/task-list';
import { useQuery } from '@/lib/hooks';

export default function MyTasksPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { data: members } = useQuery<{ user: { id: string; name: string; avatarUrl: string | null } }[]>(`/api/workspaces/${workspaceId}/members`, [workspaceId]);

  return (
    <Page>
      <PageHeader title="Tasks" subtitle="Everything you can see across the workspace, filterable." />
      <TaskListTable
        workspaceId={workspaceId}
        columns={DEFAULT_COLUMNS.map((column) => ({ key: column.key, name: column.name }))}
        members={(members ?? []).map((m) => m.user)}
      />
    </Page>
  );
}
