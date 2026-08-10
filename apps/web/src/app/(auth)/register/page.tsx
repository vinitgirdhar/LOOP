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
      title="Welcome."
      subtitle="Create an account, verify your email, then build your first workspace."
      footer={<>Already have an account? <AuthFooterLink href="/login">Sign in</AuthFooterLink></>}
    >
      <form onSubmit={submit} className="space-y-4">
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

        {/* Inside the ink panel, strength reads through opacity — a green that
            passes on white would sit at 3:1 against near-black. */}
        <ul className="grid grid-cols-2 gap-1.5">
          {RULES.map((rule) => {
            const passed = rule.test(password);
            return (
              <li key={rule.label} className={`flex items-center gap-1.5 text-[11.5px] font-medium ${passed ? 'opacity-100' : 'opacity-45'}`}>
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

        <Button type="submit" variant="primary" className="btn-hero" loading={loading} disabled={!valid}>
          Sign up
        </Button>
      </form>
      <AuthDivider label="or continue with" />
      <GoogleButton label="Google" />
      <p className="mt-4 text-center text-[12px] leading-relaxed opacity-60">
        Email verification is required before you can create a workspace.
      </p>
    </AuthCard>
  );
}
