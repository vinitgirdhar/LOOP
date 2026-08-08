'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader, StatTile } from '@/components/page';
import { Avatar, Badge, Button, Card, Confirm, EmptyState, ErrorState, Modal, Progress, SectionTitle, Skeleton } from '@/components/ui';
import { BarChart, LineChart } from '@/components/charts';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PRIORITY_STYLE, cx, formatShortDate } from '@/lib/format';

interface SprintDetail {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string;
  endDate: string;
  capacity: number;
  project: { id: string; key: string; name: string; columns: { key: string; name: string; isDone: boolean }[] };
  tasks: {
    id: string;
    number: number;
    title: string;
    status: string;
    priority: string;
    storyPoints: number | null;
    completedAt: string | null;
    isBlocked: boolean;
    assignee: { id: string; name: string; avatarUrl: string | null } | null;
    labels: { id: string; name: string; color: string }[];
  }[];
  stats: {
    totalTasks: number;
    doneTasks: number;
    totalPoints: number;
    donePoints: number;
    completion: number;
    capacityUsed: number;
    blockers: { id: string; number: number; title: string; note: string | null }[];
  };
}

interface Burndown {
  totalPoints: number;
  ideal: { date: string; remaining: number }[];
  actual: { date: string; remaining: number; completed: number; remainingTasks: number }[];
  burnup: { date: string; completed: number; scope: number }[];
}

interface SprintPlan {
  capacity: number;
  averageVelocity: number;
  pointsUsed: number;
  suggested: { id: string; key: string; title: string; priority: string; points: number }[];
  skippedBlocked: number;
  rationale: string | null;
  model: string | null;
}

export default function SprintPage({ params }: { params: Promise<{ workspaceId: string; sprintId: string }> }) {
  const { workspaceId, sprintId } = use(params);
  const toast = useToast();
  const { can } = useAuth();

  const { data: sprint, loading, error, refetch } = useQuery<SprintDetail>(`/api/sprints/${sprintId}`, [sprintId]);
  const { data: burndown } = useQuery<Burndown>(`/api/sprints/${sprintId}/burndown`, [sprintId]);
  const { data: velocity } = useQuery<{ sprints: { sprint: string; committed: number; completed: number }[]; averageVelocity: number }>(
    sprint ? `/api/sprints/velocity/${sprint.project.id}` : null,
    [sprint?.project.id],
  );

  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<SprintPlan | null>(null);
  const [planning, setPlanning] = useState(false);

  if (loading && !sprint) {
    return (
      <Page>
        <Skeleton className="mb-4 h-16 w-full" />
        <Skeleton className="h-80 w-full" />
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <ErrorState message={error} onRetry={refetch} />
      </Page>
    );
  }
  if (!sprint) return null;

  const daysLeft = Math.max(0, Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / 86_400_000));

  return (
    <Page>
      <PageHeader
        back={{ href: `/w/${workspaceId}/sprints`, label: 'Sprints' }}
        title={sprint.name}
        subtitle={sprint.goal}
        meta={
          <>
            <Badge tone={sprint.status === 'ACTIVE' ? 'success' : sprint.status === 'COMPLETED' ? 'info' : 'neutral'}>{sprint.status.toLowerCase()}</Badge>
            <Link href={`/w/${workspaceId}/projects/${sprint.project.id}`} className="text-[11px] text-[var(--accent)] hover:underline">
              {sprint.project.key} · {sprint.project.name}
            </Link>
            <span className="text-[11px] text-[var(--text-muted)]">
              {formatShortDate(sprint.startDate)} → {formatShortDate(sprint.endDate)}
            </span>
          </>
        }
        actions={
          can('sprint.manage') && (
            <>
              <Button
                size="sm"
                icon={<Icon.sparkles width={14} height={14} />}
                loading={planning}
                onClick={async () => {
                  setPlanning(true);
                  try {
                    const { data } = await api.post<SprintPlan>('/api/ai/sprint-plan', { projectId: sprint.project.id, capacity: sprint.capacity });
                    setPlan(data);
                  } catch (caught: unknown) {
                    toast.error(apiErrorMessage(caught));
                  } finally {
                    setPlanning(false);
                  }
                }}
              >
                Plan next sprint
              </Button>
              {sprint.status === 'PLANNED' && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.post(`/api/sprints/${sprint.id}/start`);
                      toast.success('Sprint started');
                      void refetch();
                    } catch (caught: unknown) {
                      toast.error(apiErrorMessage(caught));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Start sprint
                </Button>
              )}
              {sprint.status === 'ACTIVE' && (
                <Button size="sm" variant="primary" onClick={() => setClosing(true)}>
                  Close sprint
                </Button>
              )}
            </>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Completion" value={`${sprint.stats.completion}%`} hint={`${sprint.stats.donePoints}/${sprint.stats.totalPoints} points`} />
        <StatTile label="Tasks" value={`${sprint.stats.doneTasks}/${sprint.stats.totalTasks}`} hint="done" />
        <StatTile
          label="Capacity used"
          value={`${sprint.stats.capacityUsed}%`}
          hint={`${sprint.stats.totalPoints} of ${sprint.capacity} pts`}
          tone={sprint.stats.capacityUsed > 100 ? 'var(--danger)' : undefined}
        />
        <StatTile label="Days left" value={daysLeft} hint={sprint.status === 'ACTIVE' ? 'in this sprint' : sprint.status.toLowerCase()} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {burndown && (
            <Card>
              <SectionTitle title="Burndown" subtitle="Ideal line against real daily snapshots" />
              <LineChart
                height={190}
                series={[
                  { label: 'Ideal', color: 'var(--text-faint)', dashed: true, points: burndown.ideal.map((p) => ({ x: p.date.slice(5), y: p.remaining })) },
                  { label: 'Remaining', color: 'var(--accent)', points: burndown.actual.map((p) => ({ x: p.date.slice(5), y: p.remaining })) },
                ]}
              />
            </Card>
          )}

          {burndown && burndown.burnup.length > 1 && (
            <Card>
              <SectionTitle title="Burnup" subtitle="Completed against total scope" />
              <LineChart
                height={160}
                series={[
                  { label: 'Scope', color: 'var(--text-faint)', dashed: true, points: burndown.burnup.map((p) => ({ x: p.date.slice(5), y: p.scope })) },
                  { label: 'Completed', color: 'var(--success)', points: burndown.burnup.map((p) => ({ x: p.date.slice(5), y: p.completed })) },
                ]}
              />
            </Card>
          )}

          <Card padded={false}>
            <div className="px-4 pt-4">
              <SectionTitle title="Sprint backlog" subtitle={`${sprint.tasks.length} tasks`} />
            </div>
            {sprint.tasks.length === 0 ? (
              <div className="px-4 pb-4">
                <EmptyState title="Nothing in this sprint" description="Move tasks into it from the board or the list view." />
              </div>
            ) : (
              <ul className="divide-y">
                {sprint.tasks.map((task) => {
                  const done = Boolean(task.completedAt) || sprint.project.columns.find((c) => c.key === task.status)?.isDone;
                  return (
                    <li key={task.id}>
                      <Link href={`/w/${workspaceId}/tasks/${task.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--bg-inset)]">
                        <span className={cx('h-2 w-2 shrink-0 rounded-full', done ? 'bg-[var(--success)]' : task.isBlocked ? 'bg-[var(--danger)]' : 'bg-[var(--border-strong)]')} />
                        <span className="min-w-0 flex-1">
                          <span className={cx('block truncate text-[13px]', done && 'text-[var(--text-faint)] line-through')}>{task.title}</span>
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            <span className="font-mono">{sprint.project.key}-{task.number}</span> · {sprint.project.columns.find((c) => c.key === task.status)?.name ?? task.status}
                          </span>
                        </span>
                        <span className={cx('badge shrink-0', PRIORITY_STYLE[task.priority]?.className)}>{PRIORITY_STYLE[task.priority]?.label}</span>
                        {task.storyPoints !== null && <span className="shrink-0 rounded bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{task.storyPoints}</span>}
                        {task.assignee && <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size={22} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Progress" />
            <Progress value={sprint.stats.completion} height={8} tone="var(--success)" />
            <p className="mt-2 text-[13px] text-[var(--text-muted)]">
              {sprint.stats.donePoints} of {sprint.stats.totalPoints} points closed.
            </p>
          </Card>

          <Card>
            <SectionTitle title="Blockers" subtitle={`${sprint.stats.blockers.length} flagged`} />
            {sprint.stats.blockers.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">Nothing is blocked.</p>
            ) : (
              <ul className="space-y-2">
                {sprint.stats.blockers.map((blocker) => (
                  <li key={blocker.id} className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-2.5">
                    <Link href={`/w/${workspaceId}/tasks/${blocker.id}`} className="text-[13px] font-medium hover:underline">
                      {sprint.project.key}-{blocker.number} {blocker.title}
                    </Link>
                    {blocker.note && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{blocker.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {velocity && velocity.sprints.length > 0 && (
            <Card>
              <SectionTitle title="Velocity" subtitle={`Average ${velocity.averageVelocity} points per sprint`} />
              <BarChart data={velocity.sprints.map((row) => ({ label: row.sprint.replace(/\D+/g, '') || row.sprint.slice(0, 6), value: row.completed }))} height={130} />
            </Card>
          )}
        </div>
      </div>

      <Modal open={Boolean(plan)} onClose={() => setPlan(null)} title="Suggested sprint plan" wide>
        {plan && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Capacity" value={`${plan.capacity} pts`} />
              <StatTile label="Filled" value={`${plan.pointsUsed} pts`} />
              <StatTile label="Avg velocity" value={plan.averageVelocity} />
            </div>
            <p className="text-[12px] text-[var(--text-muted)]">
              Selection is a deterministic greedy fill by priority — blocked items are skipped ({plan.skippedBlocked} in the backlog). The model only reviews and
              explains it; it cannot add or remove tasks.
            </p>
            {plan.rationale && <p className="whitespace-pre-wrap rounded-lg border-l-2 border-[var(--accent)] bg-[var(--accent-soft)]/50 px-3 py-2 text-[13px] leading-relaxed">{plan.rationale}</p>}
            <ul className="divide-y rounded-lg border">
              {plan.suggested.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="font-mono text-[11px] text-[var(--text-faint)]">{item.key}</span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className={cx('badge', PRIORITY_STYLE[item.priority]?.className)}>{PRIORITY_STYLE[item.priority]?.label}</span>
                  <span className="rounded bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{item.points}</span>
                </li>
              ))}
            </ul>
            {plan.model && <p className="text-[10px] text-[var(--text-faint)]">Rationale written by {plan.model}.</p>}
          </div>
        )}
      </Modal>

      <Confirm
        open={closing}
        title="Close this sprint"
        message="Unfinished tasks move back to the backlog and a final burndown point is recorded."
        confirmLabel="Close sprint"
        loading={busy}
        onCancel={() => setClosing(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const { data } = await api.post<{ rolledOver: number }>(`/api/sprints/${sprint.id}/complete`, { moveUnfinishedTo: null });
            toast.success(`Sprint closed · ${data.rolledOver} item(s) rolled over`);
            setClosing(false);
            void refetch();
          } catch (caught: unknown) {
            toast.error(apiErrorMessage(caught));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Page>
  );
}
