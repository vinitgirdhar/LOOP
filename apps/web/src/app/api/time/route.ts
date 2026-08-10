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
    .select('*, task:tasks (id, number, title, project:projects (id, key, name)), user:profiles (id, name, avatar_url)', {
      count: 'exact',
    })
    .eq('workspace_id', ws.workspaceId)
    .order('started_at', { ascending: false })
    .range(from, to);

  query = query.eq('user_id', requested ?? user.id);

  const fromDay = url.searchParams.get('from');
  const toDay = url.searchParams.get('to');
  const projectId = url.searchParams.get('projectId');
  if (fromDay) query = query.gte('day', fromDay);
  if (toDay) query = query.lte('day', toDay);
  if (projectId) query = query.eq('project_id', projectId);

  const { data, error, count } = await query;
  assertOk(error, 'Time logs');
  return ok(data ?? [], { total: count ?? 0, page, limit });
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
