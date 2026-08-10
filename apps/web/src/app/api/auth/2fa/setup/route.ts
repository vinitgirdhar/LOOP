import { requireUser } from '@/lib/server/context';
import { badRequest, ok, route } from '@/lib/server/http';

/**
 * Starts TOTP enrolment. The factor stays `unverified` until a code from the
 * authenticator app proves the secret was actually scanned, so an abandoned
 * setup cannot lock anyone out.
 */
export const POST = route(async () => {
  const { supabase } = await requireUser();

  // Clear any half-finished attempt, otherwise Supabase rejects the new one as
  // a duplicate friendly name.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  const abandoned = (existing?.all ?? []).filter((factor) => factor.factor_type === 'totp' && factor.status !== 'verified');
  for (const factor of abandoned) await supabase.auth.mfa.unenroll({ factorId: factor.id });

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Loop' });
  if (error) throw badRequest(error.message);

  return ok({ secret: data.totp.secret, qrDataUrl: data.totp.qr_code, factorId: data.id });
});
