import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { supabase, ws } = await requireMember(request, await params);

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, role, title, capacity_hrs, joined_at, department_id, user:profiles (id, name, email, avatar_url, mascot, last_seen_at)')
    .eq('workspace_id', ws.workspaceId)
    .order('joined_at', { ascending: true });

  assertOk(error, 'Members');
  return ok(data ?? []);
});
