import { requireUser } from '@/lib/server/context';
import { badRequest, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Supabase does not let a client revoke one named session, only the current one
 * or all of them. Rather than pretend, revoking anything other than the current
 * session is refused with an explanation, and the UI offers "sign out
 * everywhere" for the case that actually matters.
 */
export const DELETE = route(async (_request: Request, { params }: Params) => {
  const { sessionId } = await params;
  const { supabase } = await requireUser();

  if (sessionId !== 'current') {
    throw badRequest('Individual sessions cannot be revoked. Use "Sign out everywhere" instead.');
  }

  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw badRequest(error.message);

  return ok({ revoked: true });
});
