import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string; subtaskId: string }> };

const schema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { taskId, subtaskId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('subtasks')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.done !== undefined ? { done: input.done } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    })
    .eq('id', subtaskId)
    .eq('task_id', taskId)
    .select('*')
    .single();

  assertOk(error, 'Subtask');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { taskId, subtaskId } = await params;
  const ctx = await requireMember(request);

  const { error } = await ctx.supabase.from('subtasks').delete().eq('id', subtaskId).eq('task_id', taskId);
  assertOk(error, 'Subtask');
  return ok({ deleted: true });
});
