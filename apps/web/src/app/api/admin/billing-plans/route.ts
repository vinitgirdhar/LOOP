import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

export const GET = route(async () => {
  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase.from('billing_plans').select('*').order('key');
  assertOk(error, 'Plans');
  return ok(data ?? []);
});
