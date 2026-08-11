import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

export const GET = route(async () => {
  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, created_at, plan:billing_plans (id, key, name), owner:profiles (id, name, email), workspaces (id, name)')
    .order('created_at', { ascending: false });

  assertOk(error, 'Organisations');

  const orgs = (data ?? []) as unknown as Record<string, unknown>[];
  const workspaceIds = orgs.flatMap((org) => ((org.workspaces ?? []) as { id: string }[]).map((w) => w.id));

  const [{ data: members }, { data: projects }] = workspaceIds.length
    ? await Promise.all([
        supabase.from('workspace_members').select('workspace_id').in('workspace_id', workspaceIds),
        supabase.from('projects').select('workspace_id').in('workspace_id', workspaceIds),
      ])
    : [{ data: [] }, { data: [] }];

  const tally = (source: unknown) => {
    const counts = new Map<string, number>();
    for (const row of (source ?? []) as { workspace_id: string }[]) {
      counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1);
    }
    return counts;
  };
  const memberCount = tally(members);
  const projectCount = tally(projects);

  return ok(
    orgs.map((org) => ({
      ...org,
      workspaces: ((org.workspaces ?? []) as { id: string; name: string }[]).map((workspace) => ({
        ...workspace,
        _count: { members: memberCount.get(workspace.id) ?? 0, projects: projectCount.get(workspace.id) ?? 0 },
      })),
    })),
  );
});
