import { requireMember } from '@/lib/server/context';
import { assertOk, badRequest, ok, route } from '@/lib/server/http';

export const POST = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);

  const { data: running } = await supabase
    .from('time_logs')
    .select('id, started_at')
    .eq('workspace_id', ws.workspaceId)
    .eq('user_id', user.id)
    .eq('is_running', true)
    .maybeSingle();

  if (!running) throw badRequest('No timer is running');

  const endedAt = new Date();
  const seconds = Math.max(1, Math.round((endedAt.getTime() - Date.parse(running.started_at)) / 1000));

  const { data, error } = await supabase
    .from('time_logs')
    .update({ ended_at: endedAt.toISOString(), seconds, is_running: false })
    .eq('id', running.id)
    .select('*')
    .single();

  assertOk(error, 'Timer');
  return ok(data);
});
