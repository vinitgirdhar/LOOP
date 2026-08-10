import { requireMember } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';
import { computeHealth, persistHealth } from '@/lib/server/health';

type Params = { params: Promise<{ projectId: string }> };

/**
 * The explainable health score.
 *
 * Reads the most recent snapshot unless `?refresh=true`, because recomputing
 * walks every open task in the project and the number only moves as work does.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase, ws } = await requireMember(request);
  const refresh = new URL(request.url).searchParams.get('refresh') === 'true';

  if (!refresh) {
    const { data: latest } = await supabase
      .from('health_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) return ok(latest);
  }

  const computed = await computeHealth(supabase, ws.workspaceId, projectId);
  await persistHealth(supabase, ws.workspaceId, projectId, computed);
  return ok(computed);
});
