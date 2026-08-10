import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string; userId: string }> };

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { projectId, userId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');

  const { error } = await ctx.supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
  assertOk(error, 'Project member');
  return ok({ removed: true });
});
