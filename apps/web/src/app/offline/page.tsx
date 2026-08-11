import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/marketing';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

/** Served by the service worker when a navigation fails and nothing is cached. */
export default function OfflinePage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size="lg" />
      <h1 className="text-2xl font-bold">You are offline</h1>
      <p className="max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
        Pages you have already opened still work, and anything you change is saved on this device and sent
        when the connection comes back.
      </p>
      <Link href="/app" className="btn btn-secondary btn-sm">
        Try again
      </Link>
    </main>
  );
}
