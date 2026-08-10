'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthCard, AuthDivider, AuthFooterLink, FormError, GoogleButton } from '@/components/auth-form';
import { Button, Field } from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';

const RULES = [
  { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v: string) => /[a-z]/.test(v), label: 'A lowercase letter' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'An uppercase letter' },
  { test: (v: string) => /\d/.test(v), label: 'A number' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid = RULES.every((rule) => rule.test(password)) && name.trim().length >= 2 && email.includes('@');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/register', { name: name.trim(), email: email.trim().toLowerCase(), password });
      router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Verify your email, then create a workspace and invite the team."
      footer={<>Already have an account? <AuthFooterLink href="/login">Sign in</AuthFooterLink></>}
    >
      <GoogleButton label="Sign up with Google" />
      <AuthDivider />
      <form onSubmit={submit} className="space-y-3">
        <FormError message={error} />
        <Field label="Full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
        </Field>
        <Field label="Work email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </Field>

        <ul className="grid grid-cols-2 gap-1">
          {RULES.map((rule) => {
            const passed = rule.test(password);
            return (
              <li key={rule.label} className={`flex items-center gap-1.5 text-[11px] ${passed ? 'text-[var(--success)]' : 'text-[var(--text-faint)]'}`}>
                <span aria-hidden className="shrink-0">
                  {passed ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="8" />
                    </svg>
                  )}
                </span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={!valid}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--text-faint)]">
        Email verification is required before you can create a workspace.
      </p>
    </AuthCard>
  );
}
