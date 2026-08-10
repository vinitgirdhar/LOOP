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
  return ok(data ?? [], { total: count ?? 0, page, limit });
});
