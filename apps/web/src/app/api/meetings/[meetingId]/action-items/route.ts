import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, body, created, route } from '@/lib/server/http';

type Params = { params: Promise<{ meetingId: string }> };

const schema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        assigneeId: z.string().uuid().nullable().optional(),
        dueDate: z.string().datetime().nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
  projectId: z.string().uuid(),
});

/** Turns meeting notes into real tasks, linked back to the meeting they came from. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { meetingId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'task.create');
  const input = await body(request, schema);

  const { data: columns } = await ctx.supabase
    .from('board_columns')
    .select('key')
    .eq('project_id', input.projectId)
    .order('order', { ascending: true })
    .limit(1);

  const status = columns?.[0]?.key;
  if (!status) throw badRequest('That project has no board columns yet');

  const { data, error } = await ctx.supabase
    .from('tasks')
    .insert(
      input.items.map((item) => ({
        workspace_id: ctx.ws.workspaceId,
        project_id: input.projectId,
        title: item.title,
        status,
        assignee_id: item.assigneeId ?? null,
        reporter_id: ctx.user.id,
        due_date: item.dueDate ?? null,
        meeting_id: meetingId,
      })),
    )
    .select('id, title');

  assertOk(error, 'Action items');
  return created(data ?? []);
});
