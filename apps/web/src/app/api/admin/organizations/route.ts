import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

export const GET = route(async () => {
  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, created_at, plan:billing_plans (id, key, name), owner:profiles (id, name, email)')
    .order('created_at', { ascending: false });

  assertOk(error, 'Organisations');
  return ok(data ?? []);
});
