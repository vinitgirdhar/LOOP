'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
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
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field label="Authentication code">
            <input
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </Field>
          <Button type="submit" variant="primary" className="btn-hero" loading={loading} disabled={code.length !== 6}>
            Verify and sign in
          </Button>
          <button type="button" className="w-full py-1 text-center text-[13px] opacity-70 hover:underline" onClick={() => setTicket(null)}>
            Use a different account
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome back."
      subtitle="Sign in to pick up exactly where your team left off."
      footer={<>Don&apos;t have an account? <AuthFooterLink href="/register">Sign up</AuthFooterLink></>}
    >
      <form onSubmit={submit} className="space-y-4 sm:space-y-5 lg:space-y-6">
        <FormError message={error} />
        <Field label="Email">
          <input className="input" type="email" placeholder="you@company.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <input className="input" type="password" placeholder="••••••••" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" className="btn-hero" loading={loading}>
          Sign in
        </Button>
        <div className="text-center pt-0.5">
          <Link href="/forgot-password" className="text-[13px] font-medium underline underline-offset-4 opacity-80 hover:opacity-100 sm:text-[14px]">
            Forgot the password?
          </Link>
        </div>
      </form>
      <AuthDivider label="or continue with" />
      <GoogleButton label="Google" />
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
