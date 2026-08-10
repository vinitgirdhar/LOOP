import { requireMember } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);

  const { data } = await supabase
    .from('time_logs')
    .select('*, task:tasks (id, number, title, project:projects (id, key, name))')
    .eq('workspace_id', ws.workspaceId)
    .eq('user_id', user.id)
    .eq('is_running', true)
    .maybeSingle();

  return ok(data ?? null);
});
