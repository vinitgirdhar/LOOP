import { requireMember } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

/** The Auto-Pilot inbox: proposals waiting for a human decision. */
export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);
  const { page, limit, from, to } = pagination(url, 25);

  let query = supabase
    .from('ai_suggestions')
    .select('*, task:tasks (id, number, title, status, is_blocked, project:projects (id, key, name)), ' +
      'project:projects (id, name, key, auto_apply), decidedBy:profiles (id, name)', {
      count: 'exact',
    })
    .eq('workspace_id', ws.workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const status = url.searchParams.get('status') ?? 'PENDING';
  if (status !== 'ALL') query = query.eq('status', status);

  const { data, error, count } = await query;
  assertOk(error, 'Suggestions');

  // `pending` drives the tab count and the Auto-Pilot badge in the shell, and
  // has to be the total waiting rather than the count on this page or filter.
  const { count: pending } = await supabase
    .from('ai_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ws.workspaceId)
    .eq('status', 'PENDING');

  return ok({ items: data ?? [], pending: pending ?? 0 }, { total: count ?? 0, page, limit });
});
