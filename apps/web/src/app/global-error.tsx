'use client';

/**
 * Last resort: an error thrown by the root layout itself, where the normal
 * boundary has no shell left to render into. It must ship its own <html>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '3rem 1.5rem', textAlign: 'center', color: '#0f1522' }}>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Loop could not start</h1>
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#5b6577' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        {error.digest && <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#8b95a7' }}>ref {error.digest}</p>}
        <button
          type="button"
          onClick={reset}
          style={{ marginTop: '1.5rem', padding: '0.5rem 0.875rem', borderRadius: 10, border: 0, background: '#4338ca', color: '#fff', fontSize: '0.875rem', cursor: 'pointer' }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
