'use client';

import { useState } from 'react';
import { AuthCard, AuthFooterLink, FormError, FormSuccess } from '@/components/auth-form';
import { Button, Field } from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We will email you a reset link and a one-time code."
      footer={<AuthFooterLink href="/login">Back to sign in</AuthFooterLink>}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setLoading(true);
          try {
            const { error: failed } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            // A wrong address must look identical to a right one, otherwise this
            // form becomes a way to test which emails have accounts.
            if (failed) throw new Error(failed.message);
            setSent(true);
          } catch (caught: unknown) {
            setError(apiErrorMessage(caught));
          } finally {
            setLoading(false);
          }
        }}
      >
        <FormError message={error} />
        <FormSuccess message={sent ? 'If that email is registered, a reset link is on its way.' : null} />
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
        </Field>
        <Button type="submit" variant="primary" className="btn-hero" loading={loading}>
          Send reset link
        </Button>
        {sent && (
          <AuthFooterLink href={`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}>
            I have a code — enter it
          </AuthFooterLink>
        )}
      </form>
    </AuthCard>
  );
}
