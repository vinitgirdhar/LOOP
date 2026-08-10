import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { supabase, ws } = await requireMember(request, await params);

  const { data, error } = await supabase
    .from('workspaces')
    .select('*, organization:organizations (id, name, plan)')
    .eq('id', ws.workspaceId)
    .single();

  assertOk(error, 'Workspace');
  return ok(data);
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireMember(request, await params);
  await requirePermission(ctx, ctx.ws, 'workspace.update');
  const input = await body(request, patchSchema);

  const { data, error } = await ctx.supabase
    .from('workspaces')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.logoUrl !== undefined ? { logo_url: input.logoUrl } : {}),
    })
    .eq('id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Workspace');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const ctx = await requireMember(request, await params);
  await requirePermission(ctx, ctx.ws, 'workspace.delete');

  const { error } = await ctx.supabase.from('workspaces').delete().eq('id', ctx.ws.workspaceId);
  assertOk(error, 'Workspace');
  return ok({ deleted: true });
});
