import { requireMember } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

/** The Auto-Pilot inbox: proposals waiting for a human decision. */
export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);
  const { page, limit, from, to } = pagination(url, 25);

  let query = supabase
    .from('ai_suggestions')
    .select('*, task:tasks (id, number, title, project:projects (id, key)), project:projects (id, name, key)', {
      count: 'exact',
    })
    .eq('workspace_id', ws.workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const status = url.searchParams.get('status') ?? 'PENDING';
  if (status !== 'ALL') query = query.eq('status', status);

  const { data, error, count } = await query;
  assertOk(error, 'Suggestions');
  return ok(data ?? [], { total: count ?? 0, page, limit });
});
