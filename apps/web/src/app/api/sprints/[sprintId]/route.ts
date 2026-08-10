import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';
import { TASK_SELECT, withKeys } from '@/lib/server/tasks';

type Params = { params: Promise<{ sprintId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { sprintId } = await params;
  const { supabase, ws } = await requireMember(request);

  const [sprint, tasks] = await Promise.all([
    supabase
      .from('sprints')
      .select('*, project:projects (id, name, key)')
      .eq('id', sprintId)
      .eq('workspace_id', ws.workspaceId)
      .single(),
    supabase.from('tasks').select(TASK_SELECT).eq('sprint_id', sprintId).order('order', { ascending: true }),
  ]);

  assertOk(sprint.error, 'Sprint');
  return ok({ ...sprint.data, tasks: withKeys(tasks.data ?? []) });
});

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  goal: z.string().trim().max(500).nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  capacity: z.number().int().min(0).max(1000).nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { sprintId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'sprint.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('sprints')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
      ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
      ...(input.endDate !== undefined ? { end_date: input.endDate } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    })
    .eq('id', sprintId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Sprint');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { sprintId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'sprint.manage');

  const { error } = await ctx.supabase.from('sprints').delete().eq('id', sprintId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Sprint');
  return ok({ deleted: true });
});
