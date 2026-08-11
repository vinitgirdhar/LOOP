import { z } from 'zod';
import { PRIORITIES } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';
import { TASK_SELECT, withKey } from '@/lib/server/tasks';

type Params = { params: Promise<{ taskId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('tasks')
    .select(
      `${TASK_SELECT}, subtasks (*), labels:task_labels (label:labels (*)), attachments (*), ` +
        'blockedBy:task_dependencies!task_dependencies_blocked_id_fkey (id, blocker_id), ' +
        'blocking:task_dependencies!task_dependencies_blocker_id_fkey (id, blocked_id)',
    )
    .eq('id', taskId)
    .eq('workspace_id', ws.workspaceId)
    .single();

  assertOk(error, 'Task');

  const { count } = await supabase.from('comments').select('id', { count: 'exact', head: true }).eq('task_id', taskId);

  return ok({ ...withKey(data!), _count: { comments: count ?? 0 } });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  status: z.string().trim().max(30).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  estimateHrs: z.number().min(0).max(1000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  isBlocked: z.boolean().optional(),
  blockedNote: z.string().trim().max(500).nullable().optional(),
});

/**
 * Editing someone else's task needs the wider permission; editing your own only
 * needs the narrow one. Both map to the same database key, so the distinction
 * is drawn here where the assignee is known.
 */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, patchSchema);

  const { data: existing } = await ctx.supabase
    .from('tasks')
    .select('assignee_id, reporter_id, project_id, status')
    .eq('id', taskId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .maybeSingle();

  const mine = existing?.assignee_id === ctx.user.id || existing?.reporter_id === ctx.user.id;
  await requirePermission(ctx, ctx.ws, mine ? 'task.update.own' : 'task.update.any');

  // Moving into a done column stamps completion, moving back out clears it.
  let completedAt: string | null | undefined;
  if (input.status && existing && input.status !== existing.status) {
    const { data: column } = await ctx.supabase
      .from('board_columns')
      .select('is_done')
      .eq('project_id', existing.project_id)
      .eq('key', input.status)
      .maybeSingle();

    completedAt = column?.is_done ? new Date().toISOString() : null;
  }

  const { data, error } = await ctx.supabase
    .from('tasks')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assignee_id: input.assigneeId } : {}),
      ...(input.sprintId !== undefined ? { sprint_id: input.sprintId } : {}),
      ...(input.milestoneId !== undefined ? { milestone_id: input.milestoneId } : {}),
      ...(input.storyPoints !== undefined ? { story_points: input.storyPoints } : {}),
      ...(input.estimateHrs !== undefined ? { estimate_hrs: input.estimateHrs } : {}),
      ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
      ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
      ...(input.isBlocked !== undefined ? { is_blocked: input.isBlocked } : {}),
      ...(input.blockedNote !== undefined ? { blocked_note: input.blockedNote } : {}),
      ...(completedAt !== undefined ? { completed_at: completedAt } : {}),
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select(TASK_SELECT)
    .single();

  assertOk(error, 'Task');
  return ok(withKey(data!));
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'task.delete');

  const { error } = await ctx.supabase.from('tasks').delete().eq('id', taskId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Task');
  return ok({ deleted: true });
});
