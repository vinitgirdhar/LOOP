import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { badRequest, body, ok, route } from '@/lib/server/http';
import { enforceRateLimit } from '@/lib/server/rate-limit';

const schema = z.object({ code: z.string().trim().length(6, 'Enter the six digit code') });

export const POST = route(async (request: Request) => {
  const { supabase, user } = await requireUser();
  await enforceRateLimit(supabase, 'auth', user.id);
  const { code } = await body(request, schema);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const pending = (factors?.all ?? []).find((factor) => factor.factor_type === 'totp' && factor.status !== 'verified');
  if (!pending) throw badRequest('Start the setup again — there is nothing waiting to be confirmed');

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pending.id, code });
  if (error) throw badRequest('That code is not right. Check the app and try again.');

  return ok({ enabled: true });
});
