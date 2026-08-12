import { requireMember, requirePermission } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/**
 * Per-project totals for the analytics table.
 *
 * Returns `tasks`, `done`, `overdue`, `progress` and `health` because those are
 * the fields the table renders. It used to return `totalTasks`/`completedTasks`
 * and no colour or health at all, so every row showed blanks and the health
 * badge scored `undefined` as Critical.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.analytics.view');

  const [{ data: projects }, { data: tasks }, { data: health }] = await Promise.all([
    ctx.supabase
      .from('projects')
      .select('id, name, key, status, color, deadline')
      .eq('workspace_id', ctx.ws.workspaceId)
      .neq('status', 'ARCHIVED'),
    ctx.supabase
      .from('tasks')
      .select('project_id, completed_at, due_date, story_points')
      .eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase
      .from('health_snapshots')
      .select('project_id, score, created_at')
      .eq('workspace_id', ctx.ws.workspaceId)
      .order('created_at', { ascending: false }),
  ]);

  const now = Date.now();

  // One pass over the tasks rather than a full scan per project: this is the
  // analytics table, and a workspace with a few thousand tasks made the old
  // projects x tasks nesting the slowest part of the response.
  const totals = new Map<string, { total: number; done: number; overdue: number; points: number }>();
  for (const task of (tasks ?? []) as { project_id: string; completed_at: string | null; due_date: string | null; story_points: number | null }[]) {
    const entry = totals.get(task.project_id) ?? { total: 0, done: 0, overdue: 0, points: 0 };
    entry.total += 1;
    if (task.completed_at) entry.done += 1;
    else if (task.due_date && Date.parse(task.due_date) < now) entry.overdue += 1;
    entry.points += task.story_points ?? 0;
    totals.set(task.project_id, entry);
  }

  // Rows arrive newest first, so the first one seen per project is the current
  // score and everything after it is history.
  const latestHealth = new Map<string, number>();
  for (const row of (health ?? []) as { project_id: string; score: number }[]) {
    if (!latestHealth.has(row.project_id)) latestHealth.set(row.project_id, row.score);
  }

  return ok(
    ((projects ?? []) as { id: string; name: string; key: string; status: string; color: string; deadline: string | null }[]).map((project) => {
      const own = totals.get(project.id) ?? { total: 0, done: 0, overdue: 0, points: 0 };
      return {
        id: project.id,
        key: project.key,
        name: project.name,
        color: project.color,
        status: project.status,
        deadline: project.deadline,
        tasks: own.total,
        done: own.done,
        overdue: own.overdue,
        storyPoints: own.points,
        progress: own.total === 0 ? 0 : Math.round((own.done / own.total) * 100),
        // No snapshot yet means the nightly job has not run for this project.
        // 100 reads as "nothing wrong known", which is the honest default.
        health: latestHealth.get(project.id) ?? 100,
      };
    }),
  );
});
