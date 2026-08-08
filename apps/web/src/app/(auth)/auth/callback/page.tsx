'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth';
import { Spinner } from '@/components/ui';

/**
 * Google redirects here after the API has set the httpOnly refresh cookie.
 * No token ever travels in the URL — we simply exchange the cookie for an
 * access token and move on.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void refresh().then((ok) => (ok ? router.replace('/app') : setFailed(true)));
  }, [refresh, router]);

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {failed ? (
        <>
          <p className="text-sm font-semibold">We could not complete that sign-in</p>
          <p className="text-[13px] text-[var(--text-muted)]">The link may have expired. Try again from the sign-in page.</p>
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
