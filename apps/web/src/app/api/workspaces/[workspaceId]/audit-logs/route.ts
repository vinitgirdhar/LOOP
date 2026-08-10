import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const ctx = await requireMember(request, await params);
  await requirePermission(ctx, ctx.ws, 'workspace.audit.view');
  const { page, limit, from, to } = pagination(new URL(request.url), 30);

  const { data, error, count } = await ctx.supabase
    .from('audit_log')
    .select('*, actor:profiles (id, name, email, avatar_url)', { count: 'exact' })
    .eq('workspace_id', ctx.ws.workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to);

  assertOk(error, 'Audit log');
  return ok(data ?? [], { total: count ?? 0, page, limit });
});
