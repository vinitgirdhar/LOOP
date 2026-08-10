import { requireMember } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { supabase, ws } = await requireMember(request, await params);
  const { page, limit, from, to } = pagination(new URL(request.url), 30);

  const { data, error, count } = await supabase
    .from('activity_log')
    .select('*, actor:profiles (id, name, avatar_url, mascot)', { count: 'exact' })
    .eq('workspace_id', ws.workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to);

  assertOk(error, 'Activity');
  return ok(data ?? [], { total: count ?? 0, page, limit });
});
