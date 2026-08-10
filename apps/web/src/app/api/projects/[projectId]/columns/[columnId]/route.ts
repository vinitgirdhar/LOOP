import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string; columnId: string }> };

const schema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  order: z.number().int().min(0).optional(),
  isDone: z.boolean().optional(),
  color: z.string().trim().max(20).optional(),
  wipLimit: z.number().int().min(1).max(50).nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { projectId, columnId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('board_columns')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.isDone !== undefined ? { is_done: input.isDone } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.wipLimit !== undefined ? { wip_limit: input.wipLimit } : {}),
    })
    .eq('id', columnId)
    .eq('project_id', projectId)
    .select('*')
    .single();

  assertOk(error, 'Column');
  return ok(data);
});

/** A column holding tasks cannot be dropped — the tasks would lose their status. */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const { projectId, columnId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');

  const { data: column } = await ctx.supabase
    .from('board_columns')
    .select('key')
    .eq('id', columnId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (column) {
    const { count } = await ctx.supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', column.key);

    if ((count ?? 0) > 0) throw badRequest('Move the tasks out of this column first');
  }

  const { error } = await ctx.supabase.from('board_columns').delete().eq('id', columnId).eq('project_id', projectId);
  assertOk(error, 'Column');
  return ok({ deleted: true });
});
