import { requireUser } from '@/lib/server/context';
import { badRequest, ok, route } from '@/lib/server/http';

/** Revokes every refresh token for this user, on every device. */
export const POST = route(async () => {
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) throw badRequest(error.message);
  return ok({ signedOut: true });
});
