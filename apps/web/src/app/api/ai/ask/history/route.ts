import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('ask_logs')
    .select('*')
    .eq('workspace_id', ws.workspaceId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  assertOk(error, 'History');
  return ok(data ?? []);
});
