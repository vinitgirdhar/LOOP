import { requireMember, requirePermission } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.analytics.view');

  const [{ data: members }, { data: tasks }] = await Promise.all([
    ctx.supabase
      .from('workspace_members')
      .select('user_id, capacity_hrs, user:profiles (id, name, avatar_url, mascot)')
      .eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase
      .from('tasks')
      .select('assignee_id, completed_at, estimate_hrs, due_date')
      .eq('workspace_id', ctx.ws.workspaceId)
      .is('completed_at', null),
  ]);

  const now = Date.now();
  return ok(
    (members ?? []).map((member) => {
      const own = (tasks ?? []).filter((task) => task.assignee_id === member.user_id);
      return {
        user: member.user,
        capacityHrs: member.capacity_hrs ?? 40,
        openTasks: own.length,
        estimatedHrs: Math.round(own.reduce((sum, task) => sum + (task.estimate_hrs ?? 0), 0) * 10) / 10,
        overdue: own.filter((task) => task.due_date && Date.parse(task.due_date) < now).length,
      };
    }),
  );
});
