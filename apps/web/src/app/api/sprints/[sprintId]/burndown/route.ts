import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ sprintId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { sprintId } = await params;
  const { supabase } = await requireMember(request);

  const { data, error } = await supabase
    .from('burndown_points')
    .select('*')
    .eq('sprint_id', sprintId)
    .order('date', { ascending: true });

  assertOk(error, 'Burndown');
  return ok(data ?? []);
});
