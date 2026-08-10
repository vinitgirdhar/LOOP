import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, created, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string }> };

const schema = z.object({ title: z.string().trim().min(1).max(200) });

export const POST = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, schema);

  const { count } = await ctx.supabase.from('subtasks').select('id', { count: 'exact', head: true }).eq('task_id', taskId);

  const { data, error } = await ctx.supabase
    .from('subtasks')
    .insert({ task_id: taskId, title: input.title, order: count ?? 0 })
    .select('*')
    .single();

  assertOk(error, 'Subtask');
  return created(data);
});
