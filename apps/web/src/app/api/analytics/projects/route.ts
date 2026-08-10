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
  return ok(
    (projects ?? []).map((project) => {
      const own = (tasks ?? []).filter((task) => task.project_id === project.id);
      const done = own.filter((task) => task.completed_at).length;
      const overdue = own.filter((task) => !task.completed_at && task.due_date && Date.parse(task.due_date) < now).length;
      const points = own.reduce((sum, task) => sum + (task.story_points ?? 0), 0);

      return {
        ...project,
        totalTasks: own.length,
        completedTasks: done,
        overdueTasks: overdue,
        storyPoints: points,
        completionRate: own.length === 0 ? 0 : Math.round((done / own.length) * 100),
      };
    }),
  );
});
