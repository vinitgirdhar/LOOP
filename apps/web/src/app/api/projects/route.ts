import { z } from 'zod';
import { DEFAULT_COLUMNS, PROJECT_STATUSES, PRIORITIES } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, body, created, ok, route } from '@/lib/server/http';
import { recordAudit } from '@/lib/server/audit';

/**
 * The project list, with the figures the cards render.
 *
 * Counts, progress and the latest health score are derived here rather than
 * left to the client: the browser must not have to fetch every task of every
 * project to render a progress bar, and the card reads `_count`, `progress`
 * and `health[]` directly.
 */
export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = supabase
    .from('projects')
    .select('*, members:project_members (id, role, user:profiles (id, name, email, avatar_url))')
    .eq('workspace_id', ws.workspaceId)
    .order('updated_at', { ascending: false });

  if (status) query = query.eq('status', status);
  else query = query.neq('status', 'ARCHIVED');

  const { data, error } = await query;
  assertOk(error, 'Projects');

  const projects = data ?? [];
  const ids = projects.map((project: { id: string }) => project.id);
  if (ids.length === 0) return ok([]);

  const [tasks, sprints, health] = await Promise.all([
    supabase.from('tasks').select('project_id, completed_at').eq('workspace_id', ws.workspaceId).in('project_id', ids),
    supabase.from('sprints').select('project_id').eq('workspace_id', ws.workspaceId).in('project_id', ids),
    supabase
      .from('health_snapshots')
      .select('project_id, score, created_at')
      .in('project_id', ids)
      .order('created_at', { ascending: false }),
  ]);

  const totals = new Map<string, { tasks: number; done: number }>();
  for (const row of (tasks.data ?? []) as { project_id: string; completed_at: string | null }[]) {
    const entry = totals.get(row.project_id) ?? { tasks: 0, done: 0 };
    entry.tasks += 1;
    if (row.completed_at) entry.done += 1;
    totals.set(row.project_id, entry);
  }

  const sprintCounts = new Map<string, number>();
  for (const row of (sprints.data ?? []) as { project_id: string }[]) {
    sprintCounts.set(row.project_id, (sprintCounts.get(row.project_id) ?? 0) + 1);
  }

  // Ordered newest first, so the first score per project is the current one.
  const latestHealth = new Map<string, number>();
  for (const row of (health.data ?? []) as { project_id: string; score: number }[]) {
    if (!latestHealth.has(row.project_id)) latestHealth.set(row.project_id, row.score);
  }

  return ok(
    projects.map((project: Record<string, unknown>) => {
      const id = project.id as string;
      const counted = totals.get(id) ?? { tasks: 0, done: 0 };
      const score = latestHealth.get(id);
      const members = (project.members ?? []) as { user: unknown }[];

      return {
        ...project,
        // The card maps `members[].user`, so a membership without a readable
        // profile is dropped rather than handed over as undefined.
        members: members.filter((member) => member.user),
        taskCount: counted.tasks,
        doneCount: counted.done,
        progress: counted.tasks === 0 ? 0 : Math.round((counted.done / counted.tasks) * 100),
        health: score === undefined ? [] : [{ score }],
        _count: { tasks: counted.tasks, members: members.length, sprints: sprintCounts.get(id) ?? 0 },
      };
    }),
  );
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'Give the project a name').max(80),
  key: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Use 2-10 uppercase letters or digits, e.g. PAY')
    .optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(PROJECT_STATUSES).default('PLANNING'),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  color: z.string().trim().max(20).optional(),
  startDate: z.string().datetime().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
});

const keyFrom = (name: string) =>
  (name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'PROJ').padEnd(2, 'X');

/**
 * A new project also gets the default board. Without columns the Kanban view
 * has nowhere to put anything, and `tasks.status` references `board_columns.key`.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.create');
  const input = await body(request, createSchema);

  const key = input.key ?? keyFrom(input.name);

  const { data: clash } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', ctx.ws.workspaceId)
    .eq('key', key)
    .maybeSingle();
  if (clash) throw badRequest(`The key ${key} is already used in this workspace`);

  // Deliberately no `.select()` on the insert. The projects SELECT policy calls
  // app_can_see_project(id), which re-reads public.projects; that function is
  // STABLE, so inside INSERT ... RETURNING it runs against the pre-statement
  // snapshot and cannot see the row being written. Postgres then reports the
  // failed read as "new row violates row-level security policy". Reading it back
  // in a separate statement sees the committed row and succeeds.
  const { error } = await ctx.supabase
    .from('projects')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      name: input.name,
      key,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      ...(input.color ? { color: input.color } : {}),
      start_date: input.startDate ?? null,
      deadline: input.deadline ?? null,
    });

  assertOk(error, 'Project');

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', ctx.ws.workspaceId)
    .eq('key', key)
    .single();

  const { error: columnsFailed } = await ctx.supabase.from('board_columns').insert(
    DEFAULT_COLUMNS.map((column) => ({
      project_id: project!.id,
      key: column.key,
      name: column.name,
      order: column.order,
      is_done: column.isDone,
      color: column.color,
      wip_limit: 'wipLimit' in column ? column.wipLimit : null,
    })),
  );
  assertOk(columnsFailed, 'Board columns');

  await ctx.supabase.from('project_members').insert({ project_id: project!.id, user_id: ctx.user.id, role: 'LEAD' });

  await recordAudit({
    workspaceId: ctx.ws.workspaceId,
    actorId: ctx.user.id,
    action: 'project.created',
    entity: 'project',
    entityId: project!.id,
    meta: { key: project!.key, name: project!.name },
  });

  return created(project);
});
