import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase } = await requirePlatformAdmin();
  const url = new URL(request.url);
  const { page, limit, from, to } = pagination(url, 25);

  let query = supabase
    .from('profiles')
    .select('id, name, email, avatar_url, is_platform_admin, is_suspended, timezone, last_seen_at, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to);

  const search = url.searchParams.get('q');
  if (search) {
    const like = `%${search.replace(/[,()]/g, ' ')}%`;
    query = query.or(`name.ilike.${like},email.ilike.${like}`);
  }

  const { data, error, count } = await query;
  assertOk(error, 'Users');
  return ok(data ?? [], { total: count ?? 0, page, limit });
});
