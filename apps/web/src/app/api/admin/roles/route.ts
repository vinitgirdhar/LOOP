import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

/** The live matrix out of the database, not the copy compiled into the client. */
export const GET = route(async () => {
  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase
    .from('roles')
    .select('id, key, name, rank, permissions:role_permissions (permission:permissions (key, description))')
    .order('rank', { ascending: false });

  assertOk(error, 'Roles');
  return ok(data ?? []);
});
