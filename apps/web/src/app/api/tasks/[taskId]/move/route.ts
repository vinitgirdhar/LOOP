import { z } from 'zod';
import { requireMember, requirePermission, type Ctx } from '@/lib/server/context';
import { assertOk, body, notFound, ok, route } from '@/lib/server/http';
import { TASK_SELECT, withKey } from '@/lib/server/tasks';

type Params = { params: Promise<{ taskId: string }> };

const schema = z.object({
  status: z.string().trim().min(1).max(30),
  // The board sends the drop position as `index`; `order` is accepted too so
  // an explicit float can still be passed. Either one is resolved to a real
  // `order` value below.
  index: z.number().int().min(0).optional(),
  order: z.number().optional(),
});

/** Drag and drop on the board: new column, new position within it. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, schema);

  const { data: existing } = await ctx.supabase
    .from('tasks')
    .select('assignee_id, reporter_id, project_id')
    .eq('id', taskId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .maybeSingle();

  if (!existing) throw notFound('Task not found');

  const mine = existing.assignee_id === ctx.user.id || existing.reporter_id === ctx.user.id;
  await requirePermission(ctx, ctx.ws, mine ? 'task.update.own' : 'task.update.any');

  const { data: column } = await ctx.supabase
    .from('board_columns')
    .select('is_done')
    .eq('project_id', existing.project_id)
    .eq('key', input.status)
    .maybeSingle();

  if (!column) throw notFound('That column does not exist on this board');

  // Resolve the drop position to a concrete `order`. `order` is a double, so a
  // task slots between its new neighbours by averaging their values — no
  // renumbering of the rest of the column.
  // ponytail: averaging halves the gap each time; a column reordered hundreds
  // of times could exhaust float precision. Renumber the column then if it ever
  // matters — it won't at this scale.
  const resolvedOrder = await positionFor(ctx.supabase, existing.project_id, input.status, taskId, input.order, input.index);

  const { data, error } = await ctx.supabase
    .from('tasks')
    .update({
      status: input.status,
      ...(resolvedOrder !== undefined ? { order: resolvedOrder } : {}),
      completed_at: column.is_done ? new Date().toISOString() : null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select(TASK_SELECT)
    .single();

  assertOk(error, 'Task');
  return ok(withKey(data!));
});

/**
 * The `order` a task should take to land at `index` within a column.
 *
 * An explicit `order` wins. Otherwise the destination column's other tasks are
 * read in order and the new value is placed just outside, or midway between, the
 * neighbours at that index — the board sorts by `order` ascending, so this is
 * what makes a drop stay where it was dropped.
 */
async function positionFor(
  supabase: Ctx['supabase'],
  projectId: string,
  status: string,
  taskId: string,
  order: number | undefined,
  index: number | undefined,
): Promise<number | undefined> {
  if (order !== undefined) return order;
  if (index === undefined) return undefined;

  const { data } = await supabase
    .from('tasks')
    .select('order')
    .eq('project_id', projectId)
    .eq('status', status)
    .neq('id', taskId)
    .order('order', { ascending: true });

  const orders = (data ?? []).map((row) => (row as { order: number }).order);
  if (orders.length === 0) return 1000;
  if (index <= 0) return orders[0] - 1;
  if (index >= orders.length) return orders[orders.length - 1] + 1;
  return (orders[index - 1] + orders[index]) / 2;
}
