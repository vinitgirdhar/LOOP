'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader, StatTile } from '@/components/page';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Progress, SectionTitle, Skeleton } from '@/components/ui';
import { BarChart, LineChart } from '@/components/charts';
import { Icon } from '@/components/icons';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/providers/toast';
import { healthTone } from '@/lib/format';

interface Overview {
  totals: { projects: number; tasks: number; completed: number; overdue: number; blocked: number; members: number; completionRate: number; hoursLogged30d: number };
  throughput: { day: string; tasks: number; points: number }[];
}

interface WorkloadRow {
  user: { id: string; name: string; avatarUrl: string | null };
  role: string;
  capacityHrs: number;
  openTasks: number;
  openPoints: number;
  overdue: number;
}

interface ProjectRow {
  id: string;
  key: string;
  name: string;
  color: string;
  status: string;
  tasks: number;
  done: number;
  overdue: number;
  progress: number;
  health: number;
}

export default function AnalyticsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const toast = useToast();

  const { data: overview, loading, error, refetch } = useQuery<Overview>('/api/analytics/overview', [workspaceId]);
  const { data: workload } = useQuery<WorkloadRow[]>('/api/analytics/workload', [workspaceId]);
  const { data: projects } = useQuery<ProjectRow[]>('/api/analytics/projects', [workspaceId]);

  const maxOpen = Math.max(1, ...(workload ?? []).map((row) => row.openTasks));

  return (
    <Page>
      <PageHeader
        title="Analytics"
        subtitle="Progress, velocity, workload and health across the workspace"
        actions={
          <Button
            size="sm"
            icon={<Icon.download width={14} height={14} />}
            onClick={async () => {
              try {
                const { data } = await api.raw<string>('/api/analytics/export.csv', { raw: true });
                const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'loop-tasks.csv';
                anchor.click();
                URL.revokeObjectURL(url);
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              }
            }}
          >
            Export CSV
          </Button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading && !overview ? (
        <Skeleton className="h-96 w-full" />
      ) : overview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Completion rate" value={`${overview.totals.completionRate}%`} hint={`${overview.totals.completed} of ${overview.totals.tasks} tasks`} />
            <StatTile label="Overdue" value={overview.totals.overdue} tone={overview.totals.overdue > 0 ? 'var(--danger)' : undefined} hint="open and past due" />
            <StatTile label="Blocked" value={overview.totals.blocked} tone={overview.totals.blocked > 0 ? 'var(--warning)' : undefined} hint="waiting on something" />
            <StatTile label="Hours (30d)" value={overview.totals.hoursLogged30d} hint={`${overview.totals.members} members`} />
          </div>

          <Card>
            <SectionTitle title="Throughput" subtitle="Tasks and story points completed per day, last 30 days" />
            {overview.throughput.length === 0 ? (
              <EmptyState title="No completed work yet" />
            ) : (
              <LineChart
                height={180}
                series={[
                  { label: 'Tasks', color: 'var(--accent)', points: overview.throughput.map((row) => ({ x: row.day.slice(5), y: row.tasks })) },
                  { label: 'Story points', color: 'var(--success)', points: overview.throughput.map((row) => ({ x: row.day.slice(5), y: row.points })) },
                ]}
              />
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <SectionTitle title="Workload distribution" subtitle="Open tasks per person, with overdue counts" />
              {!workload || workload.length === 0 ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <ul className="space-y-2.5">
                  {workload
                    .slice()
                    .sort((a, b) => b.openTasks - a.openTasks)
                    .map((row) => (
                      <li key={row.user.id}>
                        <div className="mb-1 flex items-center gap-2">
                          <Avatar seed={row.user.id} name={row.user.name} src={row.user.avatarUrl} size={22} />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{row.user.name}</span>
                          {row.overdue > 0 && <Badge tone="danger">{row.overdue} overdue</Badge>}
                          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                            {row.openTasks} open · {row.openPoints} pts
                          </span>
                        </div>
                        <Progress value={(row.openTasks / maxOpen) * 100} tone={row.overdue > 0 ? 'var(--danger)' : 'var(--accent)'} />
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            <Card>
              <SectionTitle title="Story points by person" />
              {workload && (
                <BarChart data={workload.map((row) => ({ label: (row.user?.name ?? 'Unassigned').split(' ')[0]!, value: row.openPoints }))} height={170} />
              )}
            </Card>
          </div>

          <Card padded={false}>
            <div className="px-4 pt-4">
              <SectionTitle title="Projects" subtitle="Progress and health side by side" />
            </div>
            {!projects ? (
              <Skeleton className="mx-4 mb-4 h-40" />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-[13px]">
                  <thead className="border-y bg-[var(--bg-subtle)] text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
                    <tr>
                      <th className="px-4 py-2 font-medium">Project</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Progress</th>
                      <th className="px-4 py-2 text-right font-medium">Tasks</th>
                      <th className="px-4 py-2 text-right font-medium">Overdue</th>
                      <th className="px-4 py-2 text-right font-medium">Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {projects.map((project) => {
                      const tone = healthTone(project.health);
                      return (
                        <tr key={project.id} className="hover:bg-[var(--bg-inset)]">
                          <td className="px-4 py-2">
                            <Link href={`/w/${workspaceId}/projects/${project.id}`} className="flex items-center gap-2 hover:underline">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: project.color }} />
                              <span className="font-medium">{project.name}</span>
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-[var(--text-muted)]">{project.status.replace('_', ' ').toLowerCase()}</td>
                          <td className="w-48 px-4 py-2">
                            <div className="flex items-center gap-2">
                              <Progress value={project.progress} tone={project.color} />
                              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">{project.progress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {project.done}/{project.tasks}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {project.overdue > 0 ? <span className="font-semibold text-[var(--danger)]">{project.overdue}</span> : '—'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="badge" style={{ background: `${tone.color}1a`, color: tone.color }}>
                              {project.health}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-center text-[11px] text-[var(--text-faint)]">
            Raw data is also available as a CSV export above, or through the{' '}
            <a href="/api/health" target="_blank" rel="noreferrer" className="link">
              workspace API
            </a>
            .
          </p>
        </div>
      ) : null}
    </Page>
  );
}
