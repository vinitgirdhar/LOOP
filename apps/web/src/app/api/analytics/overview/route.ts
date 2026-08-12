import { requireMember, requirePermission } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/**
 * Workspace headline numbers, plus the 30-day throughput series.
 *
 * The shape here is `{ totals, throughput }` because that is what the page
 * reads. It previously returned six flat fields under different names, so
 * `overview.totals.completionRate` threw a TypeError on every render and the
 * whole Analytics view fell into its error boundary — the API was fine, the
 * two sides had simply never agreed on a contract.
 *
 * Throughput is computed from the completed tasks themselves rather than a
 * stored series, so the chart is real history and not a straight line drawn
 * between two points.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.analytics.view');

  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 86_400_000);
  const monthAgo = windowStart.toISOString();

  const [projects, tasks, completedTotal, recent, overdue, blocked, members, timeLogs] = await Promise.all([
    ctx.supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.ws.workspaceId).neq('status', 'ARCHIVED'),
    ctx.supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.ws.workspaceId).not('completed_at', 'is', null),
    // The rows behind the chart: one point per day needs the dates themselves.
    ctx.supabase
      .from('tasks')
      .select('completed_at, story_points')
      .eq('workspace_id', ctx.ws.workspaceId)
      .gte('completed_at', monthAgo),
    ctx.supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.ws.workspaceId)
      .is('completed_at', null)
      .lt('due_date', now.toISOString()),
    ctx.supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.ws.workspaceId)
      .is('completed_at', null)
      .eq('is_blocked', true),
    ctx.supabase.from('workspace_members').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase.from('time_logs').select('seconds').eq('workspace_id', ctx.ws.workspaceId).gte('day', monthAgo.slice(0, 10)),
  ]);

  const loggedHrs = (timeLogs.data ?? []).reduce((sum, log) => sum + (log.seconds ?? 0), 0) / 3600;

  // Every day in the window is present, including the quiet ones — a chart that
  // silently skips empty days compresses time and overstates the trend.
  const byDay = new Map<string, { tasks: number; points: number }>();
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    byDay.set(day, { tasks: 0, points: 0 });
  }
  for (const row of (recent.data ?? []) as { completed_at: string | null; story_points: number | null }[]) {
    if (!row.completed_at) continue;
    const day = row.completed_at.slice(0, 10);
    const entry = byDay.get(day);
    if (!entry) continue;
    entry.tasks += 1;
    entry.points += row.story_points ?? 0;
  }

  const total = tasks.count ?? 0;
  const done = completedTotal.count ?? 0;

  return ok({
    totals: {
      projects: projects.count ?? 0,
      tasks: total,
      completed: done,
      overdue: overdue.count ?? 0,
      blocked: blocked.count ?? 0,
      members: members.count ?? 0,
      completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
      hoursLogged30d: Math.round(loggedHrs * 10) / 10,
    },
    throughput: [...byDay.entries()].map(([day, value]) => ({ day, tasks: value.tasks, points: value.points })),
  });
});
