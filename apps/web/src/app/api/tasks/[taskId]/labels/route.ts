import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, created, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string }> };

const schema = z.object({ labelId: z.string().uuid() });

export const POST = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('task_labels')
    .insert({ task_id: taskId, label_id: input.labelId })
    .select('*, label:labels (*)')
    .single();

  assertOk(error, 'Label');
  return created(data);
});
