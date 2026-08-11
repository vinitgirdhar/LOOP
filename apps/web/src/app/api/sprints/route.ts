import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  let query = supabase
    .from('sprints')
    .select('*, project:projects (id, name, key)')
    .eq('workspace_id', ws.workspaceId)
    .order('start_date', { ascending: false });

  const projectId = url.searchParams.get('projectId');
  const status = url.searchParams.get('status');
  if (projectId) query = query.eq('project_id', projectId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  assertOk(error, 'Sprints');

  const sprints = data ?? [];
  const ids = sprints.map((sprint: { id: string }) => sprint.id);
  if (ids.length === 0) return ok([]);

  // The sprint card shows a task count and a points total per sprint.
  const { data: tasks } = await supabase
    .from('tasks')
    .select('sprint_id, story_points, completed_at')
    .in('sprint_id', ids);

  const totals = new Map<string, { tasks: number; points: number; donePoints: number }>();
  for (const row of (tasks ?? []) as { sprint_id: string; story_points: number | null; completed_at: string | null }[]) {
    const entry = totals.get(row.sprint_id) ?? { tasks: 0, points: 0, donePoints: 0 };
    entry.tasks += 1;
    entry.points += row.story_points ?? 0;
    if (row.completed_at) entry.donePoints += row.story_points ?? 0;
    totals.set(row.sprint_id, entry);
  }

  return ok(
    sprints.map((sprint: Record<string, unknown>) => {
      const counted = totals.get(sprint.id as string) ?? { tasks: 0, points: 0, donePoints: 0 };
      return {
        ...sprint,
        totalPoints: counted.points,
        donePoints: counted.donePoints,
        percent: counted.points === 0 ? 0 : Math.round((counted.donePoints / counted.points) * 100),
        _count: { tasks: counted.tasks },
      };
    }),
  );
});

const schema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  goal: z.string().trim().max(500).nullable().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  // sprints.capacity is NOT NULL; zero means "not planned yet".
  capacity: z.number().int().min(0).max(1000).default(0),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'sprint.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('sprints')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      project_id: input.projectId,
      name: input.name,
      goal: input.goal ?? null,
      start_date: input.startDate,
      end_date: input.endDate,
      capacity: input.capacity,
      status: 'PLANNED',
    })
    .select('*')
    .single();

  assertOk(error, 'Sprint');
  return created(data);
});
