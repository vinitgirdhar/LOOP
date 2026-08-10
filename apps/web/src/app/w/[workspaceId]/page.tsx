'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader, StatTile } from '@/components/page';
import { Avatar, Badge, Card, EmptyState, ErrorState, Progress, SectionTitle, SkeletonList } from '@/components/ui';
import { DonutChart } from '@/components/charts';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { PRIORITY_STYLE, cx, formatShortDate, healthTone, isOverdue, relativeTime } from '@/lib/format';

interface Dashboard {
  activeProjects: { id: string; key: string; name: string; color: string; deadline: string | null; _count: { tasks: number }; health: number | null }[];
  myTasks: { id: string; number: number; title: string; status: string; priority: string; dueDate: string | null; isBlocked: boolean; project: { key: string; color: string } }[];
  upcomingDeadlines: { id: string; number: number; title: string; dueDate: string; assignee: { name: string; avatarUrl: string | null } | null; project: { key: string } }[];
  sprintProgress: { id: string; name: string; project: string; endDate: string; totalPoints: number; donePoints: number; percent: number; daysLeft: number }[];
  recentActivity: { id: string; message: string; createdAt: string; type: string; actor: { id: string; name: string; avatarUrl: string | null } | null }[];
  unreadNotifications: number;
  productivity: { score: number; tasksCompletedThisWeek: number; hoursThisWeek: number };
}

export default function DashboardPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { user } = useAuth();
  const { data, loading, error, refetch } = useQuery<Dashboard>('/api/dashboard', [workspaceId]);

  return (
    <Page>
      <PageHeader
        title={`Good ${greeting()}, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle="Here is where your projects stand right now."
        actions={
          <Link href={`/w/${workspaceId}/autopilot`} className="btn btn-primary btn-sm">
            <Icon.bolt width={15} height={15} /> Auto-Pilot
          </Link>
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
          <SkeletonList rows={4} />
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Active projects" value={data.activeProjects.length} />
            <StatTile label="My open tasks" value={data.myTasks.length} hint={`${data.myTasks.filter((t) => isOverdue(t.dueDate)).length} overdue`} />
            <StatTile label="Done this week" value={data.productivity.tasksCompletedThisWeek} hint={`${data.productivity.hoursThisWeek}h logged`} />
            <StatTile label="Unread" value={data.unreadNotifications} hint="notifications" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              {/* My tasks */}
              <Card padded={false}>
                <div className="px-4 pt-4">
                  <SectionTitle
                    title="My tasks"
                    subtitle="Ordered by due date, then priority"
                    action={
                      <Link href={`/w/${workspaceId}/tasks`} className="text-xs font-medium text-[var(--accent)] hover:underline">
                        View all
                      </Link>
                    }
                  />
                </div>
                {data.myTasks.length === 0 ? (
                  <div className="px-4 pb-4">
                    <EmptyState title="Nothing assigned to you" description="Enjoy it while it lasts." />
                  </div>
                ) : (
                  <ul className="divide-y">
                    {data.myTasks.map((task) => (
                      <li key={task.id}>
                        <Link href={`/w/${workspaceId}/tasks/${task.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-inset)]">
                          <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: task.project.color }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{task.title}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                              <span className="font-mono">{task.project.key}-{task.number}</span>
                              {task.dueDate && (
                                <span className={cx(isOverdue(task.dueDate) && 'font-semibold text-[var(--danger)]')}>· {formatShortDate(task.dueDate)}</span>
                              )}
                              {task.isBlocked && <Badge tone="danger">Blocked</Badge>}
                            </p>
                          </div>
                          <span className={cx('badge shrink-0', PRIORITY_STYLE[task.priority]?.className)}>{PRIORITY_STYLE[task.priority]?.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Projects */}
              <div>
                <SectionTitle
                  title="Active projects"
                  action={
                    <Link href={`/w/${workspaceId}/projects`} className="text-xs font-medium text-[var(--accent)] hover:underline">
                      All projects
                    </Link>
                  }
                />
                {data.activeProjects.length === 0 ? (
                  <EmptyState
                    title="No active projects"
                    description="Create one to get a board, a wiki and a chat channel."
                    action={
                      <Link href={`/w/${workspaceId}/projects?new=1`} className="btn btn-primary btn-sm">
                        New project
                      </Link>
                    }
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.activeProjects.map((project) => {
                      const tone = project.health === null ? null : healthTone(project.health);
                      return (
                        <Link key={project.id} href={`/w/${workspaceId}/projects/${project.id}`} className="card p-4 transition-colors hover:border-[var(--border-strong)]">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
                              <p className="truncate text-[13px] font-semibold">{project.name}</p>
                            </div>
                            {tone && (
                              <span className="badge shrink-0" style={{ background: `${tone.color}1a`, color: tone.color }}>
                                {project.health}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                            {project._count.tasks} tasks{project.deadline ? ` · due ${formatShortDate(project.deadline)}` : ''}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right rail */}
            <div className="space-y-4">
              <Card>
                <SectionTitle title="Productivity" subtitle="Rolling 7 days" />
                <div className="flex items-center gap-4">
                  <DonutChart value={data.productivity.score} label="score" />
                  <div className="space-y-1 text-[13px]">
                    <p>
                      <strong className="tabular-nums">{data.productivity.tasksCompletedThisWeek}</strong>{' '}
                      <span className="text-[var(--text-muted)]">tasks completed</span>
                    </p>
                    <p>
                      <strong className="tabular-nums">{data.productivity.hoursThisWeek}h</strong>{' '}
                      <span className="text-[var(--text-muted)]">logged</span>
                    </p>
                  </div>
                </div>
              </Card>

              {data.sprintProgress.length > 0 && (
                <Card>
                  <SectionTitle title="Sprint progress" />
                  <div className="space-y-3">
                    {data.sprintProgress.map((sprint) => (
                      <Link key={sprint.id} href={`/w/${workspaceId}/sprints/${sprint.id}`} className="block">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[13px] font-medium">{sprint.name}</p>
                          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{sprint.daysLeft}d left</span>
                        </div>
                        <div className="mt-1.5">
                          <Progress value={sprint.percent} />
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          {sprint.donePoints}/{sprint.totalPoints} points · {sprint.percent}%
                        </p>
                      </Link>
                    ))}
                  </div>
                </Card>
              )}

              <Card>
                <SectionTitle title="Upcoming deadlines" subtitle="Next 7 days" />
                {data.upcomingDeadlines.length === 0 ? (
                  <p className="py-3 text-center text-[13px] text-[var(--text-muted)]">Nothing due this week.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.upcomingDeadlines.slice(0, 6).map((task) => (
                      <li key={task.id}>
                        <Link href={`/w/${workspaceId}/tasks/${task.id}`} className="flex items-center gap-2">
                          {task.assignee ? <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size={22} /> : <span className="h-[22px] w-[22px] rounded-full bg-[var(--bg-inset)]" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px]">{task.title}</span>
                            <span className="block text-[10px] text-[var(--text-muted)]">
                              {task.project.key}-{task.number} · {formatShortDate(task.dueDate)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <SectionTitle title="Team activity" />
                {data.recentActivity.length === 0 ? (
                  <p className="py-3 text-center text-[13px] text-[var(--text-muted)]">No activity yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {data.recentActivity.slice(0, 8).map((entry) => (
                      <li key={entry.id} className="flex gap-2">
                        {entry.actor ? (
                          <Avatar seed={entry.actor.id} name={entry.actor.name} src={entry.actor.avatarUrl} size={20} />
                        ) : (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                            <Icon.bolt width={11} height={11} />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-[12px] leading-snug">{entry.message}</p>
                          <p className="text-[10px] text-[var(--text-faint)]">{relativeTime(entry.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}
