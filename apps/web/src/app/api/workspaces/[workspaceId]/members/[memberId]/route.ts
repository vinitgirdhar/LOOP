import { z } from 'zod';
import { ROLES } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, body, forbidden, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string; memberId: string }> };

const patchSchema = z.object({
  role: z.enum(ROLES).optional(),
  title: z.string().trim().max(80).nullable().optional(),
  capacityHrs: z.number().int().min(1).max(80).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { workspaceId, memberId } = await params;
  const ctx = await requireMember(request, { workspaceId });
  await requirePermission(ctx, ctx.ws, 'workspace.member.manage');
  const input = await body(request, patchSchema);

  // The last owner must keep their role, or the workspace becomes unmanageable.
  if (input.role && input.role !== 'OWNER') {
    const { data: target } = await ctx.supabase
      .from('workspace_members')
      .select('role')
      .eq('id', memberId)
      .eq('workspace_id', ctx.ws.workspaceId)
      .maybeSingle();

    if (target?.role === 'OWNER') {
      const { count } = await ctx.supabase
        .from('workspace_members')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.ws.workspaceId)
        .eq('role', 'OWNER');

      if ((count ?? 0) <= 1) throw badRequest('A workspace needs at least one owner');
    }
  }

  const { data, error } = await ctx.supabase
    .from('workspace_members')
    .update({
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.capacityHrs !== undefined ? { capacity_hrs: input.capacityHrs } : {}),
      ...(input.departmentId !== undefined ? { department_id: input.departmentId } : {}),
    })
    .eq('id', memberId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('id, role, title, capacity_hrs, department_id, user:profiles (id, name, email, avatar_url)')
    .single();

  assertOk(error, 'Member');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { workspaceId, memberId } = await params;
  const ctx = await requireMember(request, { workspaceId });
  await requirePermission(ctx, ctx.ws, 'workspace.member.manage');

  const { data: target } = await ctx.supabase
    .from('workspace_members')
    .select('role, user_id')
    .eq('id', memberId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .maybeSingle();

  if (target?.role === 'OWNER') {
    const { count } = await ctx.supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.ws.workspaceId)
      .eq('role', 'OWNER');

    if ((count ?? 0) <= 1) throw forbidden('The last owner cannot be removed');
  }

  const { error } = await ctx.supabase.from('workspace_members').delete().eq('id', memberId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Member');
  return ok({ removed: true });
});
