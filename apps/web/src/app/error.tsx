'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary.
 *
 * Without one, a single bad field in an API response takes the whole document
 * down to Next's bare "Application error: a client-side exception has occurred",
 * which tells the user nothing and leaves them with no way out. This keeps the
 * failure inside the page and offers a retry.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[loop] route error', error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l9.5 17H2.5L12 3z" />
          <path d="M12 9v5M12 17.5v.01" />
        </svg>
      </span>
      <h1 className="text-lg font-bold tracking-[-0.02em]">This page could not be displayed</h1>
      <p className="mt-2 max-w-md text-[13px] text-[var(--text-muted)]">
        Something in the data this page received was not what it expected. The rest of the app still works.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-[var(--text-faint)]">ref {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary btn-sm">
          Try again
        </button>
        <Link href="/app" className="btn btn-secondary btn-sm">
          Back to workspaces
        </Link>
      </div>
    </div>
  );
}
