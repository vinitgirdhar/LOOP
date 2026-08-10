import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, notFound, ok, route } from '@/lib/server/http';
import { TASK_SELECT, withKey } from '@/lib/server/tasks';

type Params = { params: Promise<{ taskId: string }> };

const schema = z.object({
  status: z.string().trim().min(1).max(30),
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

  const { data, error } = await ctx.supabase
    .from('tasks')
    .update({
      status: input.status,
      ...(input.order !== undefined ? { order: input.order } : {}),
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
