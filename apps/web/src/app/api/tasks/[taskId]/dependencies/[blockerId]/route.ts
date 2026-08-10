import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string; blockerId: string }> };

/** `taskId` is blocked by `blockerId`. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { taskId, blockerId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'task.update.any');

  if (taskId === blockerId) throw badRequest('A task cannot block itself');

  const { data, error } = await ctx.supabase
    .from('task_dependencies')
    .insert({ blocked_id: taskId, blocker_id: blockerId })
    .select('*')
    .single();

  assertOk(error, 'Dependency');
  return created(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { taskId, blockerId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'task.update.any');

  const { error } = await ctx.supabase
    .from('task_dependencies')
    .delete()
    .eq('blocked_id', taskId)
    .eq('blocker_id', blockerId);

  assertOk(error, 'Dependency');
  return ok({ removed: true });
});
