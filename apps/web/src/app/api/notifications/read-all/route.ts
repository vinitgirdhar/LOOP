import { requireUser } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

export const POST = route(async () => {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  assertOk(error, 'Notifications');
  return ok({ read: true });
});
