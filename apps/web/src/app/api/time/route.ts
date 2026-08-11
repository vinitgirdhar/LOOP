import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, pagination, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);
  const url = new URL(request.url);
  const { page, limit, from, to } = pagination(url, 50);

  // Seeing someone else's timesheet is a separate permission from logging time.
  const requested = url.searchParams.get('userId');
  const mine = !requested || requested === user.id;
  if (!mine) {
    const ctx = { supabase, user };
    await requirePermission(ctx, ws, 'time.view.team');
  }

  let query = supabase
    .from('time_logs')
    .select(
      '*, project:projects (id, key, name, color), task:tasks (id, number, title, project:projects (id, key, name)), ' +
        'user:profiles (id, name, avatar_url)',
      { count: 'exact' },
    )
    .eq('workspace_id', ws.workspaceId)
    .order('started_at', { ascending: false })
    .range(from, to);

  // `scope=team` is the whole workspace's timesheet, which is the same
  // privilege as reading one named person's.
  const scope = url.searchParams.get('scope');
  if (scope === 'team') {
    await requirePermission({ supabase, user }, ws, 'time.view.team');
  } else {
    query = query.eq('user_id', requested ?? user.id);
  }

  const fromDay = url.searchParams.get('from');
  const toDay = url.searchParams.get('to');
  const projectId = url.searchParams.get('projectId');
  if (fromDay) query = query.gte('day', fromDay);
  if (toDay) query = query.lte('day', toDay);
  if (projectId) query = query.eq('project_id', projectId);

  const { data, error, count } = await query;
  assertOk(error, 'Time logs');

  // The page renders charts off `totals`, so the roll-up happens here rather
  // than making the browser re-derive it from the raw log every render.
  const logs = (data ?? []) as unknown as Record<string, unknown>[];
  const byProject = new Map<string, { projectId: string; name: string; seconds: number }>();
  const byDay = new Map<string, number>();
  let seconds = 0;

  for (const log of logs) {
    const value = (log.seconds as number) ?? 0;
    seconds += value;

    const project = (Array.isArray(log.project) ? log.project[0] : log.project) as { id?: string; name?: string } | null;
    if (project?.id) {
      const entry = byProject.get(project.id) ?? { projectId: project.id, name: project.name ?? '', seconds: 0 };
      entry.seconds += value;
      byProject.set(project.id, entry);
    }

    const day = (log.day as string | null) ?? String(log.started_at ?? '').slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + value);
  }

  return ok(
    {
      logs,
      totals: {
        seconds,
        byProject: [...byProject.values()].sort((a, b) => b.seconds - a.seconds),
        byDay: [...byDay.entries()].map(([day, total]) => ({ day, seconds: total })).sort((a, b) => a.day.localeCompare(b.day)),
      },
    },
    { total: count ?? 0, page, limit },
  );
});

const schema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  // time_logs.project_id is NOT NULL — every entry belongs to a project.
  projectId: z.string().uuid('Pick a project'),
  seconds: z.number().int().min(1).max(86400),
  note: z.string().trim().max(500).nullable().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

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
      seconds: input.seconds,
      note: input.note ?? null,
      day: input.day ?? new Date().toISOString().slice(0, 10),
      is_running: false,
    })
    .select('*')
    .single();

  assertOk(error, 'Time log');
  return created(data);
});
