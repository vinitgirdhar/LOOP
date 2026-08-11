'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps a failing page inside the workspace shell, so the navigation stays on
 * screen and the user can move somewhere else instead of losing the whole app.
 */
export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error('[loop] workspace page error', error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 text-center">
      <h1 className="text-base font-semibold">This view hit a problem</h1>
      <p className="mt-2 text-[13px] text-[var(--text-muted)]">
        The data it received did not match what it expected. Try again, or pick another section from the menu.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-[var(--text-faint)]">ref {error.digest}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary btn-sm">
          Try again
        </button>
        <button type="button" onClick={() => router.refresh()} className="btn btn-secondary btn-sm">
          Reload data
        </button>
      </div>
    </div>
  );
}
