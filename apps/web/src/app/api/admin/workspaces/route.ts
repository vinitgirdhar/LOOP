import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase } = await requirePlatformAdmin();
  const { page, limit, from, to } = pagination(new URL(request.url), 25);

  const { data, error, count } = await supabase
    .from('workspaces')
    .select('id, name, slug, logo_url, created_at, organization:organizations (id, name, plan_id), members:workspace_members (id)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to);

  assertOk(error, 'Workspaces');

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((row) => row.id as string);

  const [{ data: projects }, { data: tasks }] = ids.length
    ? await Promise.all([
        supabase.from('projects').select('workspace_id').in('workspace_id', ids),
        supabase.from('tasks').select('workspace_id').in('workspace_id', ids),
      ])
    : [{ data: [] }, { data: [] }];

  const tally = (source: unknown) => {
    const counts = new Map<string, number>();
    for (const row of (source ?? []) as { workspace_id: string }[]) {
      counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1);
    }
    return counts;
  };
  const projectCount = tally(projects);
  const taskCount = tally(tasks);

  return ok(
    rows.map((row) => {
      const id = row.id as string;
      return {
        ...row,
        _count: {
          members: ((row.members ?? []) as unknown[]).length,
          projects: projectCount.get(id) ?? 0,
          tasks: taskCount.get(id) ?? 0,
        },
      };
    }),
    { total: count ?? 0, page, limit },
  );
});
