import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ sprintId: string }> };

const schema = z.object({
  moveUnfinishedTo: z.string().uuid().nullable().optional(),
});

/**
 * Closing a sprint. Unfinished work either moves to the next sprint or returns
 * to the backlog — leaving it pointing at a closed sprint would quietly hide it.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const { sprintId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'sprint.manage');
  const input = await body(request, schema.optional().default({}));

  const { error: movedFailed } = await ctx.supabase
    .from('tasks')
    .update({ sprint_id: input.moveUnfinishedTo ?? null })
    .eq('sprint_id', sprintId)
    .is('completed_at', null);

  assertOk(movedFailed, 'Tasks');

  const { data, error } = await ctx.supabase
    .from('sprints')
    .update({ status: 'COMPLETED' })
    .eq('id', sprintId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Sprint');
  return ok(data);
});
