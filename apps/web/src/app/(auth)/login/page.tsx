'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth';
import { AuthCard, AuthDivider, AuthFooterLink, DemoAccounts, FormError, GoogleButton } from '@/components/auth-form';
import { Button, Field } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, loginWith2fa, user, ready } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(params.get('error'));
  const [loading, setLoading] = useState(false);

  const next = params.get('next') ?? '/app';

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, router, next]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (ticket) {
        await loginWith2fa(ticket, code);
        router.replace(next);
        return;
      }
      const result = await login(email.trim().toLowerCase(), password);
      if (result.twoFactorRequired && result.ticket) {
        setTicket(result.ticket);
        return;
      }
      router.replace(next);
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  if (ticket) {
    return (
      <AuthCard title="Two-factor code" subtitle="Enter the six digit code from your authenticator app.">
        <form onSubmit={submit} className="space-y-3">
          <FormError message={error} />
          <Field label="Authentication code">
            <input
              className="input text-center text-lg tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={code.length !== 6}>
            Verify and sign in
          </Button>
          <button type="button" className="w-full text-center text-xs text-[var(--text-muted)] hover:underline" onClick={() => setTicket(null)}>
            Use a different account
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={<>New here? <AuthFooterLink href="/register">Create an account</AuthFooterLink></>}
    >
      <GoogleButton label="Sign in with Google" />
      <AuthDivider />
      <form onSubmit={submit} className="space-y-3">
        <FormError message={error} />
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div className="flex justify-end">
          <AuthFooterLink href="/forgot-password">Forgot password?</AuthFooterLink>
        </div>
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
      <DemoAccounts
        onPick={(demo) => {
          setEmail(demo);
          setPassword('Password123');
        }}
      />
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
