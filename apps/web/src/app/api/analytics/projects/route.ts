import { requireMember, requirePermission } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/** Per-project totals for the analytics table. */
export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.analytics.view');

  const [{ data: projects }, { data: tasks }] = await Promise.all([
    ctx.supabase
      .from('projects')
      .select('id, name, key, status, deadline')
      .eq('workspace_id', ctx.ws.workspaceId)
      .neq('status', 'ARCHIVED'),
    ctx.supabase
      .from('tasks')
      .select('project_id, completed_at, due_date, story_points')
      .eq('workspace_id', ctx.ws.workspaceId),
  ]);

  const now = Date.now();

  // One pass over the tasks rather than a full scan per project: this is the
  // analytics table, and a workspace with a few thousand tasks made the old
  // projects x tasks nesting the slowest part of the response.
  const totals = new Map<string, { total: number; done: number; overdue: number; points: number }>();
  for (const task of tasks ?? []) {
    const entry = totals.get(task.project_id) ?? { total: 0, done: 0, overdue: 0, points: 0 };
    entry.total += 1;
    if (task.completed_at) entry.done += 1;
    else if (task.due_date && Date.parse(task.due_date) < now) entry.overdue += 1;
    entry.points += task.story_points ?? 0;
    totals.set(task.project_id, entry);
  }

  return ok(
    (projects ?? []).map((project) => {
      const own = totals.get(project.id) ?? { total: 0, done: 0, overdue: 0, points: 0 };
      const done = own.done;
      const overdue = own.overdue;
      const points = own.points;

      return {
        ...project,
        totalTasks: own.total,
        completedTasks: done,
        overdueTasks: overdue,
        storyPoints: points,
        completionRate: own.total === 0 ? 0 : Math.round((done / own.total) * 100),
      };
    }),
  );
});
