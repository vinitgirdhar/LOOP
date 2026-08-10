import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, conflict, created, route } from '@/lib/server/http';

const schema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  // time_logs.project_id is NOT NULL — every timer belongs to a project.
  projectId: z.string().uuid('Pick a project'),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * One running timer per person is a database constraint
 * (`time_logs_one_running_per_user`), so a duplicate start fails at the unique
 * index rather than through a read-then-write that two clicks could race past.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'time.log');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('time_logs')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      user_id: ctx.user.id,
      task_id: input.taskId ?? null,
      project_id: input.projectId,
      note: input.note ?? null,
      day: new Date().toISOString().slice(0, 10),
      started_at: new Date().toISOString(),
      seconds: 0,
      is_running: true,
    })
    .select('*')
    .single();

  if (error?.code === '23505') throw conflict('A timer is already running');
  assertOk(error, 'Timer');
  return created(data);
});
