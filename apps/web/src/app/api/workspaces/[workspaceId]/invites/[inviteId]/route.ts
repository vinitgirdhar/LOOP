import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string; inviteId: string }> };

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { workspaceId, inviteId } = await params;
  const ctx = await requireMember(request, { workspaceId });
  await requirePermission(ctx, ctx.ws, 'workspace.invite');

  const { error } = await ctx.supabase.from('invites').delete().eq('id', inviteId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Invite');
  return ok({ revoked: true });
});
