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

  const rows = data ?? [];
  const ids = rows.map((row: { id: string }) => row.id);

  // The table shows a workspace count per person. Sessions live in auth.*,
  // which the anon key cannot read, so that figure is reported as 0 rather
  // than guessed at.
  const { data: memberships } = ids.length
    ? await supabase.from('workspace_members').select('user_id').in('user_id', ids)
    : { data: [] as { user_id: string }[] };

  const perUser = new Map<string, number>();
  for (const row of (memberships ?? []) as { user_id: string }[]) {
    perUser.set(row.user_id, (perUser.get(row.user_id) ?? 0) + 1);
  }

  return ok(
    rows.map((row: Record<string, unknown>) => ({
      ...row,
      _count: { memberships: perUser.get(row.id as string) ?? 0, sessions: 0 },
    })),
    { total: count ?? 0, page, limit },
  );
});
