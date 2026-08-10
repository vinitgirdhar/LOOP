import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase } = await requireMember(request);

  const { data, error } = await supabase
    .from('health_snapshots')
    .select('id, score, created_at, signals')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(60);

  assertOk(error, 'Health history');
  return ok(data ?? []);
});
