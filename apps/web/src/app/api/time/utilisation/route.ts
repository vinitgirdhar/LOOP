import { requireMember, requirePermission } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/**
 * Logged hours against contracted capacity, per person, for the requested
 * window. Capacity is weekly, so it is scaled to the number of days asked for.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'time.view.team');

  const url = new URL(request.url);
  const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get('from') ?? new Date(Date.now() - 27 * 86_400_000).toISOString().slice(0, 10);
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);

  const [{ data: members }, { data: logs }] = await Promise.all([
    ctx.supabase
      .from('workspace_members')
      .select('user_id, capacity_hrs, user:profiles (id, name, avatar_url, mascot)')
      .eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase
      .from('time_logs')
      .select('user_id, seconds')
      .eq('workspace_id', ctx.ws.workspaceId)
      .gte('day', from)
      .lte('day', to),
  ]);

  const secondsByUser = new Map<string, number>();
  for (const log of logs ?? []) {
    secondsByUser.set(log.user_id, (secondsByUser.get(log.user_id) ?? 0) + (log.seconds ?? 0));
  }

  return ok(
    (members ?? []).map((member) => {
      const logged = (secondsByUser.get(member.user_id) ?? 0) / 3600;
      const capacity = ((member.capacity_hrs ?? 40) / 7) * days;
      return {
        user: member.user,
        loggedHrs: Math.round(logged * 10) / 10,
        capacityHrs: Math.round(capacity * 10) / 10,
        utilisation: capacity === 0 ? 0 : Math.round((logged / capacity) * 100),
      };
    }),
  );
});
