import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { badRequest, body, ok, route } from '@/lib/server/http';

const schema = z.object({ code: z.string().trim().length(6, 'Enter the six digit code') });

/** Turning 2FA off still needs a valid code, so a borrowed session cannot do it. */
export const POST = route(async (request: Request) => {
  const { supabase } = await requireUser();
  const { code } = await body(request, schema);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const active = (factors?.totp ?? []).find((factor) => factor.status === 'verified');
  if (!active) throw badRequest('Two factor authentication is not switched on');

  const { error: wrong } = await supabase.auth.mfa.challengeAndVerify({ factorId: active.id, code });
  if (wrong) throw badRequest('That code is not right');

  const { error } = await supabase.auth.mfa.unenroll({ factorId: active.id });
  if (error) throw badRequest(error.message);

  return ok({ enabled: false });
});
