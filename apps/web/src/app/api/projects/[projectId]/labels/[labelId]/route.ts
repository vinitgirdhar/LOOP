import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string; labelId: string }> };

const schema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().max(20).optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { projectId, labelId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('labels')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    })
    .eq('id', labelId)
    .eq('project_id', projectId)
    .select('*')
    .single();

  assertOk(error, 'Label');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { projectId, labelId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');

  const { error } = await ctx.supabase.from('labels').delete().eq('id', labelId).eq('project_id', projectId);
  assertOk(error, 'Label');
  return ok({ deleted: true });
});
