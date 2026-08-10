import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ sprintId: string }> };

/** One active sprint per project, otherwise burndown and velocity are ambiguous. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { sprintId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'sprint.manage');

  const { data: sprint } = await ctx.supabase
    .from('sprints')
    .select('project_id, status')
    .eq('id', sprintId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .maybeSingle();

  if (!sprint) throw badRequest('Sprint not found');
  if (sprint.status === 'ACTIVE') throw badRequest('That sprint is already running');

  const { count } = await ctx.supabase
    .from('sprints')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', sprint.project_id)
    .eq('status', 'ACTIVE');

  if ((count ?? 0) > 0) throw badRequest('Finish the running sprint before starting another');

  const { data, error } = await ctx.supabase
    .from('sprints')
    .update({ status: 'ACTIVE' })
    .eq('id', sprintId)
    .select('*')
    .single();

  assertOk(error, 'Sprint');
  return ok(data);
});
