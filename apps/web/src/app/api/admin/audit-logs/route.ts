import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase } = await requirePlatformAdmin();
  const { page, limit, from, to } = pagination(new URL(request.url), 30);

  const { data, error, count } = await supabase
    .from('audit_log')
    .select('*, actor:profiles (id, name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  assertOk(error, 'Audit log');
  return ok(data ?? [], { total: count ?? 0, page, limit });
});
