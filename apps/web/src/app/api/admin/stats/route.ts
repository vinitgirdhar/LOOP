import { requirePlatformAdmin } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

const count = async (
  supabase: Awaited<ReturnType<typeof requirePlatformAdmin>>['supabase'],
  table: string,
) => {
  const { count: total } = await supabase.from(table).select('id', { count: 'exact', head: true });
  return total ?? 0;
};

export const GET = route(async () => {
  const { supabase } = await requirePlatformAdmin();

  const [users, workspaces, organizations, projects, tasks] = await Promise.all([
    count(supabase, 'profiles'),
    count(supabase, 'workspaces'),
    count(supabase, 'organizations'),
    count(supabase, 'projects'),
    count(supabase, 'tasks'),
  ]);

  return ok({ users, workspaces, organizations, projects, tasks });
});
