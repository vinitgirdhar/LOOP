'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui';

/**
 * Where Supabase returns after Google sign-in, email confirmation and password
 * recovery.
 *
 * The URL carries a single-use PKCE code, never a token. Exchanging it here
 * sets the httpOnly session cookie, so nothing sensitive is left sitting in the
 * address bar or in history.
 */
function OAuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const next = params.get('next') ?? '/app';
    const code = params.get('code');
    const denied = params.get('error_description') ?? params.get('error');

    const run = async () => {
      if (denied) return setFailed(denied);

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        // A code is single use, so a duplicated effect run in development can
        // fail on the second attempt even though a session now exists.
        if (error) {
          const { data } = await supabase.auth.getSession();
          if (!data.session) return setFailed(error.message);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) return setFailed('That sign-in link is no longer valid.');
      router.replace(next);
    };

    void run();
  }, [params, router]);

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {failed ? (
        <>
          <p className="text-sm font-semibold">We could not complete that sign-in</p>
          <p className="text-[13px] text-[var(--text-muted)]">{failed}</p>
          <a href="/login" className="btn btn-primary btn-sm mt-2">
            Back to sign in
          </a>
        </>
      ) : (
        <>
          <Spinner size={22} />
          <p className="text-sm text-[var(--text-muted)]">Signing you in…</p>
        </>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<Spinner size={22} />}>
      <OAuthCallback />
    </Suspense>
  );
}
