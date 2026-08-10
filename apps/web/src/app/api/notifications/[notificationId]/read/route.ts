import { requireUser } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ notificationId: string }> };

export const POST = route(async (_request: Request, { params }: Params) => {
  const { notificationId } = await params;
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)
    .select('*')
    .single();

  assertOk(error, 'Notification');
  return ok(data);
});
