'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard, AuthFooterLink, FormError, FormSuccess } from '@/components/auth-form';
import { Button, Field } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';

function VerifyEmail() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const emailParam = params.get('email') ?? '';

  const [email, setEmail] = useState(emailParam);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const attempted = useRef(false);

  const verify = useCallback(
    async (payload: Record<string, string>) => {
      setError(null);
      setLoading(true);
      try {
        if (payload.otp) {
          const { error: failed } = await supabase.auth.verifyOtp({ email: payload.email, token: payload.otp, type: 'email' });
          if (failed) throw new Error(failed.message);
        }
        setMessage('Email verified. Redirecting you to sign in…');
        setTimeout(() => router.replace('/login'), 1400);
      } catch (caught: unknown) {
        setError(apiErrorMessage(caught));
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (token && !attempted.current) {
      attempted.current = true;
      void verify({ token });
    }
  }, [token, verify]);

  return (
    <AuthCard
      title="Verify your email"
      subtitle={token ? 'Checking your verification link…' : 'We sent you a six digit code. Enter it below, or use the link in the email.'}
      footer={<AuthFooterLink href="/login">Back to sign in</AuthFooterLink>}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void verify({ email: email.trim().toLowerCase(), otp });
        }}
      >
        <FormError message={error} />
        <FormSuccess message={message} />

        {!token && (
          <>
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Verification code">
              <input
                className="input code-input"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </Field>
            <Button type="submit" variant="primary" className="btn-hero" loading={loading} disabled={otp.length !== 6}>
              Verify email
            </Button>
            <Button
              type="button"
              className="btn-hero"
              onClick={async () => {
                setError(null);
                try {
                  const { error: failed } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
                  if (failed) throw new Error(failed.message);
                  setMessage('If that account needs verifying, a new code is on its way.');
                } catch (caught: unknown) {
                  setError(apiErrorMessage(caught));
                }
              }}
            >
              Resend code
            </Button>
            <p className="text-center text-[12px] opacity-60">
              Running locally without an email provider? The code is printed in the API console.
            </p>
          </>
        )}
      </form>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
