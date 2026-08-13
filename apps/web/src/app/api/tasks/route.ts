import { z } from 'zod';
import { PRIORITIES } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, body, created, ok, pagination, route } from '@/lib/server/http';
import { TASK_SELECT, withKey, withKeys } from '@/lib/server/tasks';
import { recordAudit } from '@/lib/server/audit';

export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);
  const { page, limit, from, to } = pagination(url, 25);

  let query = supabase
    .from('tasks')
    .select(TASK_SELECT, { count: 'exact' })
    .eq('workspace_id', ws.workspaceId)
    .order('updated_at', { ascending: false })
    .range(from, to);

  const filters: [string, string | null][] = [
    ['project_id', url.searchParams.get('projectId')],
    ['assignee_id', url.searchParams.get('assigneeId')],
    ['sprint_id', url.searchParams.get('sprintId')],
    ['status', url.searchParams.get('status')],
    ['priority', url.searchParams.get('priority')],
    ['milestone_id', url.searchParams.get('milestoneId')],
  ];
  for (const [column, value] of filters) if (value) query = query.eq(column, value);

  if (url.searchParams.get('open') === 'true') query = query.is('completed_at', null);
  const search = url.searchParams.get('q');
  if (search) query = query.ilike('title', `%${search.replace(/[,()]/g, ' ')}%`);

  const { data, error, count } = await query;
  assertOk(error, 'Tasks');
  return ok(withKeys(data ?? []), { total: count ?? 0, page, limit });
});

const createSchema = z.object({
  projectId: z.string().uuid('Pick a project'),
  title: z.string().trim().min(1, 'Give the task a title').max(200),
  description: z.string().trim().max(10000).nullable().optional(),
  status: z.string().trim().max(30).optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  assigneeId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  estimateHrs: z.number().min(0).max(1000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'task.create');
  const input = await body(request, createSchema);

  // `tasks.status` is a board column key, so an unknown one would render the
  // task into a column that does not exist.
  const { data: columns } = await ctx.supabase
    .from('board_columns')
    .select('key')
    .eq('project_id', input.projectId)
    .order('order', { ascending: true });

  const keys = (columns ?? []).map((column) => column.key);
  if (keys.length === 0) throw badRequest('That project has no board columns yet');
  const status = input.status && keys.includes(input.status) ? input.status : keys[0];

  const { data, error } = await ctx.supabase
    .from('tasks')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      project_id: input.projectId,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority,
      assignee_id: input.assigneeId ?? null,
      reporter_id: ctx.user.id,
      sprint_id: input.sprintId ?? null,
      milestone_id: input.milestoneId ?? null,
      parent_id: input.parentId ?? null,
      story_points: input.storyPoints ?? null,
      estimate_hrs: input.estimateHrs ?? null,
      due_date: input.dueDate ?? null,
      start_date: input.startDate ?? null,
    })
    .select(TASK_SELECT)
    .single();

  assertOk(error, 'Task');

  await recordAudit({
    workspaceId: ctx.ws.workspaceId,
    actorId: ctx.user.id,
    action: 'task.created',
    entity: 'task',
    entityId: (data as unknown as { id: string }).id,
    meta: { title: input.title, projectId: input.projectId },
  });

  return created(withKey(data!));
});
