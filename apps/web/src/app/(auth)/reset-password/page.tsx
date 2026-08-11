'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard, AuthFooterLink, FormError, FormSuccess } from '@/components/auth-form';
import { Button, Field } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';

function ResetPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const strong = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);

  return (
    <AuthCard
      title="Choose a new password"
      subtitle={token ? 'Almost there — pick something you have not used before.' : 'Enter the code from the email along with your new password.'}
      footer={<AuthFooterLink href="/login">Back to sign in</AuthFooterLink>}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setLoading(true);
          try {
            // Arriving from the emailed link, the browser client has already
            // swapped the code for a session, so the password can be set
            // directly. Arriving with a typed code, the OTP establishes one first.
            if (!token) {
              const { error: badCode } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token: otp,
                type: 'recovery',
              });
              if (badCode) throw new Error(badCode.message);
            }

            const { error: failed } = await supabase.auth.updateUser({ password });
            if (failed) throw new Error(failed.message);
            await supabase.auth.signOut();
            setDone(true);
            setTimeout(() => router.replace('/login'), 1400);
          } catch (caught: unknown) {
            setError(apiErrorMessage(caught));
          } finally {
            setLoading(false);
          }
        }}
      >
        <FormError message={error} />
        <FormSuccess message={done ? 'Password updated. Redirecting to sign in…' : null} />

        {!token && (
          <>
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="One-time code">
              <input
                className="input code-input"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
              />
            </Field>
          </>
        )}

        <Field label="New password" hint="At least 8 characters with upper case, lower case and a number.">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        </Field>

        <Button type="submit" variant="primary" className="btn-hero" loading={loading} disabled={!strong || (!token && otp.length !== 6)}>
          Update password
        </Button>
        <p className="text-center text-[12px] opacity-60">Every other device will be signed out.</p>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}
