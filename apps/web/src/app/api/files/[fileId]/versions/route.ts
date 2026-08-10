import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ fileId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { fileId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('attachments')
    .select('*, uploadedBy:profiles (id, name, avatar_url)')
    .eq('workspace_id', ws.workspaceId)
    .or(`id.eq.${fileId},replaces_id.eq.${fileId}`)
    .order('version', { ascending: false });

  assertOk(error, 'Versions');
  return ok(data ?? []);
});
