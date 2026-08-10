import { requireUser } from '@/lib/server/context';
import { assertOk, ok, pagination, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const url = new URL(request.url);
  const { page, limit, from, to } = pagination(url, 20);

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (url.searchParams.get('unread') === 'true') query = query.is('read_at', null);

  const { data, error, count } = await query;
  assertOk(error, 'Notifications');
  return ok(data ?? [], { total: count ?? 0, page, limit });
});
