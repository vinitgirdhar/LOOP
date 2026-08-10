import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string; labelId: string }> };

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { taskId, labelId } = await params;
  const ctx = await requireMember(request);

  const { error } = await ctx.supabase.from('task_labels').delete().eq('task_id', taskId).eq('label_id', labelId);
  assertOk(error, 'Label');
  return ok({ removed: true });
});
