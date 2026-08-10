import { z } from 'zod';
import { PRIORITIES } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Select at least one task').max(200),
  status: z.string().trim().max(30).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
});

export const PATCH = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'task.update.any');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('tasks')
    .update({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assignee_id: input.assigneeId } : {}),
      ...(input.sprintId !== undefined ? { sprint_id: input.sprintId } : {}),
      last_activity_at: new Date().toISOString(),
    })
    .in('id', input.ids)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('id');

  assertOk(error, 'Tasks');
  return ok({ updated: data?.length ?? 0 });
});
