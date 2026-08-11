import { requireMember } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/**
 * Everything the workspace home screen shows, in one round trip.
 *
 * The shape here is the contract the dashboard component reads — counts and
 * derived figures included. Postgres has no `_count` of its own, so the
 * aggregates are assembled from `head: true` counts (which transfer no rows)
 * and small grouped reads rather than pulling whole tables into the handler.
 */
export const GET = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const inAWeek = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  const [projects, myTasks, deadlines, sprints, activity, notifications, doneThisWeek, timeThisWeek] = await Promise.all([
    supabase
      .from('projects')
      .select('id, key, name, color, deadline')
      .eq('workspace_id', ws.workspaceId)
      .in('status', ['PLANNING', 'ACTIVE', 'ON_HOLD'])
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('tasks')
      .select('id, number, title, status, priority, due_date, is_blocked, project:projects (key, color)')
      .eq('workspace_id', ws.workspaceId)
      .eq('assignee_id', user.id)
      .is('completed_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('tasks')
      .select('id, number, title, due_date, project:projects (key), assignee:profiles!tasks_assignee_id_fkey (name, avatar_url)')
      .eq('workspace_id', ws.workspaceId)
      .is('completed_at', null)
      .gte('due_date', nowIso)
      .lte('due_date', inAWeek)
      .order('due_date', { ascending: true })
      .limit(6),
    supabase
      .from('sprints')
      .select('id, name, end_date, project:projects (name)')
      .eq('workspace_id', ws.workspaceId)
      .eq('status', 'ACTIVE')
      .limit(4),
    supabase
      .from('activity_log')
      .select('id, message, type, created_at, actor:profiles (id, name, avatar_url)')
      .eq('workspace_id', ws.workspaceId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws.workspaceId)
      .eq('user_id', user.id)
      .is('read_at', null),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws.workspaceId)
      .eq('assignee_id', user.id)
      .gte('completed_at', weekAgo),
    supabase
      .from('time_logs')
      .select('seconds')
      .eq('workspace_id', ws.workspaceId)
      .eq('user_id', user.id)
      .gte('started_at', weekAgo),
  ]);

  const projectRows = projects.data ?? [];
  const projectIds = projectRows.map((p: { id: string }) => p.id);
  const sprintRows = sprints.data ?? [];
  const sprintIds = sprintRows.map((s: { id: string }) => s.id);

  // Task counts per project, and sprint point totals. Both are id-only reads:
  // the rows are narrow and the alternative is a count query per project.
  const [projectTaskIds, sprintTasks, health] = await Promise.all([
    projectIds.length
      ? supabase.from('tasks').select('project_id').eq('workspace_id', ws.workspaceId).in('project_id', projectIds)
      : Promise.resolve({ data: [] as { project_id: string }[] }),
    sprintIds.length
      ? supabase.from('tasks').select('sprint_id, story_points, completed_at').in('sprint_id', sprintIds)
      : Promise.resolve({ data: [] as { sprint_id: string; story_points: number | null; completed_at: string | null }[] }),
    projectIds.length
      ? supabase
          .from('health_snapshots')
          .select('project_id, score, created_at')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { project_id: string; score: number; created_at: string }[] }),
  ]);

  const tasksPerProject = new Map<string, number>();
  for (const row of (projectTaskIds.data ?? []) as { project_id: string }[]) {
    tasksPerProject.set(row.project_id, (tasksPerProject.get(row.project_id) ?? 0) + 1);
  }

  // Ordered newest first, so the first score seen for a project is the current one.
  const latestHealth = new Map<string, number>();
  for (const row of (health.data ?? []) as { project_id: string; score: number }[]) {
    if (!latestHealth.has(row.project_id)) latestHealth.set(row.project_id, row.score);
  }

  const sprintProgress = sprintRows.map((sprint: { id: string; name: string; end_date: string; project: unknown }) => {
    const rows = ((sprintTasks.data ?? []) as { sprint_id: string; story_points: number | null; completed_at: string | null }[]).filter(
      (t) => t.sprint_id === sprint.id,
    );
    const totalPoints = rows.reduce((sum, t) => sum + (t.story_points ?? 0), 0);
    const donePoints = rows.filter((t) => t.completed_at).reduce((sum, t) => sum + (t.story_points ?? 0), 0);
    const project = Array.isArray(sprint.project) ? sprint.project[0] : sprint.project;

    return {
      id: sprint.id,
      name: sprint.name,
      project: (project as { name?: string } | null)?.name ?? '',
      endDate: sprint.end_date,
      totalPoints,
      donePoints,
      percent: totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 100),
      daysLeft: Math.max(0, Math.ceil((new Date(sprint.end_date).getTime() - now.getTime()) / 86_400_000)),
    };
  });

  const secondsThisWeek = ((timeThisWeek.data ?? []) as { seconds: number }[]).reduce((sum, row) => sum + (row.seconds ?? 0), 0);
  const completedThisWeek = doneThisWeek.count ?? 0;
  const hoursThisWeek = Math.round((secondsThisWeek / 3600) * 10) / 10;

  return ok({
    activeProjects: projectRows.map((project: { id: string }) => ({
      ...project,
      _count: { tasks: tasksPerProject.get(project.id) ?? 0 },
      health: latestHealth.get(project.id) ?? null,
    })),
    myTasks: myTasks.data ?? [],
    upcomingDeadlines: deadlines.data ?? [],
    sprintProgress,
    recentActivity: activity.data ?? [],
    unreadNotifications: notifications.count ?? 0,
    // A light, explainable blend: throughput this week against hours logged.
    productivity: {
      score: Math.min(100, completedThisWeek * 12 + Math.round(hoursThisWeek * 2)),
      tasksCompletedThisWeek: completedThisWeek,
      hoursThisWeek,
    },
  });
});
