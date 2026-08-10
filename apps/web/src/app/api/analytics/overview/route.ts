import { requireMember, requirePermission } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.analytics.view');

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [projects, tasks, completed, overdue, members, timeLogs] = await Promise.all([
    ctx.supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.ws.workspaceId).neq('status', 'ARCHIVED'),
    ctx.supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.ws.workspaceId)
      .gte('completed_at', monthAgo),
    ctx.supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.ws.workspaceId)
      .is('completed_at', null)
      .lt('due_date', now.toISOString()),
    ctx.supabase.from('workspace_members').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase.from('time_logs').select('seconds').eq('workspace_id', ctx.ws.workspaceId).gte('day', monthAgo.slice(0, 10)),
  ]);

  const loggedHrs = (timeLogs.data ?? []).reduce((sum, log) => sum + (log.seconds ?? 0), 0) / 3600;

  return ok({
    projects: projects.count ?? 0,
    tasks: tasks.count ?? 0,
    completedLast30: completed.count ?? 0,
    overdue: overdue.count ?? 0,
    members: members.count ?? 0,
    loggedHrsLast30: Math.round(loggedHrs * 10) / 10,
  });
});
