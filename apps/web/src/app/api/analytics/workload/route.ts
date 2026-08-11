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

  // Grouped in one pass; the per-member scan was quadratic on a busy workspace.
  const load = new Map<string, { open: number; hours: number; overdue: number }>();
  for (const task of tasks ?? []) {
    if (!task.assignee_id) continue;
    const entry = load.get(task.assignee_id) ?? { open: 0, hours: 0, overdue: 0 };
    entry.open += 1;
    entry.hours += task.estimate_hrs ?? 0;
    if (task.due_date && Date.parse(task.due_date) < now) entry.overdue += 1;
    load.set(task.assignee_id, entry);
  }

  return ok(
    (members ?? []).map((member) => {
      const own = load.get(member.user_id) ?? { open: 0, hours: 0, overdue: 0 };
      return {
        user: member.user,
        capacityHrs: member.capacity_hrs ?? 40,
        openTasks: own.open,
        estimatedHrs: Math.round(own.hours * 10) / 10,
        overdue: own.overdue,
      };
    }),
  );
});
