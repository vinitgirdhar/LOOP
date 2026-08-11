import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string; linkId: string }> };

/**
 * Revokes rather than deletes.
 *
 * Whoever shared the link deserves to see that it existed, who made it and how
 * often it was opened, after it stops working. A DELETE would take the audit
 * trail with it.
 */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const { projectId, linkId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');

  const { data, error } = await ctx.supabase
    .from('project_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId)
    .eq('project_id', projectId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('id, revoked_at')
    .single();

  assertOk(error, 'Share link');
  return ok(data);
});
