import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { badRequest, body, ok, route, unauthorized } from '@/lib/server/http';

const schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

/**
 * Supabase will change a password for any signed-in session, so the current one
 * is re-checked first. Without that, a borrowed session could lock the real
 * owner out of their account.
 */
export const POST = route(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const { currentPassword, password } = await body(request, schema);

  const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (wrong) throw unauthorized('That current password is not right');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw badRequest(error.message);

  return ok({ changed: true });
});
