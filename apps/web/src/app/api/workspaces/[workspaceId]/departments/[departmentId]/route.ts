import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string; departmentId: string }> };

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(300).nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { workspaceId, departmentId } = await params;
  const ctx = await requireMember(request, { workspaceId });
  await requirePermission(ctx, ctx.ws, 'workspace.department.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('departments')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .eq('id', departmentId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Department');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { workspaceId, departmentId } = await params;
  const ctx = await requireMember(request, { workspaceId });
  await requirePermission(ctx, ctx.ws, 'workspace.department.manage');

  const { error } = await ctx.supabase.from('departments').delete().eq('id', departmentId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Department');
  return ok({ deleted: true });
});
