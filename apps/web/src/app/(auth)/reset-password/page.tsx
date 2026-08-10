'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard, AuthFooterLink, FormError, FormSuccess } from '@/components/auth-form';
import { Button, Field } from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';

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
            await api.post('/api/auth/reset-password', token ? { token, password } : { email: email.trim().toLowerCase(), otp, password });
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
