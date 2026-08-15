'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
import { Mascot, mascotFor } from '@/components/mascots';
import { ThemeToggle } from '@/components/providers/theme';
import { LocaleSwitcher, useT } from '@/components/providers/locale';
import { Logo } from '@/components/marketing';
import { useMediaQuery } from '@/lib/hooks';

/*
  The hero scene is the landing page's workspace graph, re-lit for the inverted
  auth panel. It is mounted only past `lg`, and the import is dynamic, so a
  phone never downloads three.js to look at a password field — which is the
  reason the still SVG below exists at all.
*/
const AuthScene = dynamic(() => import('@/components/three/network'), { ssr: false, loading: () => null });

/**
 * The auth screen shape.
 *
 * A dark hero carrying the mark, with a sheet of paper lifting over it on one
 * deeply rounded corner — the form lives on the paper. On a wide screen the
 * stack turns on its side: hero left, sheet right, rounded down its full
 * leading edge.
 *
 * Both surfaces are tokens, so dark mode inverts the pair rather than
 * flattening it: the hero becomes paper and the sheet becomes ink.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  tagline = 'One workspace. Always current.',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  tagline?: string;
}) {
  const router = useRouter();
  // Matches the `lg` breakpoint the layout switches on. Gating the mount rather
  // than hiding it with a class is the point: a hidden canvas still ships its
  // library and still holds a WebGL context.
  const wide = useMediaQuery('(min-width: 1024px)');

  /*
    On a phone the whole screen is the card: fixed to the viewport, nothing
    scrolls behind it. Any overflow is handled inside the sheet, so a short
    handset degrades to a small internal scroll instead of the page itself
    sliding around under a floating hero.

    That last part has to be `overflow-y-auto`, not `overflow-hidden`. With the
    root pinned to `h-dvh` and the sheet clipping, anything past the fold — the
    demo account chips on a 664px viewport — was unreachable rather than
    scrollable: the page could not scroll and neither could the sheet.
  */
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--ink)] text-[var(--ink-text)] lg:h-auto lg:min-h-dvh lg:flex-row lg:overflow-visible">
      {/* ── hero ──────────────────────────────────────────────────────── */}
      <div
        className="relative flex h-[30vh] min-h-[190px] shrink-0 flex-col justify-between overflow-hidden px-5 pb-5 pt-3 sm:h-[40vh] sm:min-h-[260px] sm:px-8 lg:h-auto lg:w-[44%] lg:min-h-0 lg:justify-start lg:pb-8 lg:pt-8"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <ConstellationMark />

        <header className="relative z-10 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="-ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[color-mix(in_oklab,var(--ink-text)_10%,transparent)] sm:h-11 sm:w-11"
            aria-label="Go back"
          >
            <Icon.arrowLeft width={19} height={19} />
          </button>

          <LocaleSwitcher className="text-[var(--ink-text)]" />
          <ThemeToggle className="text-[var(--ink-text)] hover:bg-[color-mix(in_oklab,var(--ink-text)_10%,transparent)] hover:text-[var(--ink-text)]" />
        </header>

        {/* Dynamic ThreeJS Scene on Desktop */}
        {wide && (
          <div className="relative my-2 min-h-0 flex-1">
            <AuthScene surface="ink" />
          </div>
        )}

        {/* Logo and software information inside the black hero space */}
        <div className="relative z-10 my-auto pb-2 pt-1 lg:my-0 lg:pb-0">
          <AuthMark />
          <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-[var(--ink-muted)] opacity-90 sm:text-[13.5px] lg:mt-3 lg:text-[14px]">
            {tagline} — Unified software engineering & project management platform.
          </p>
        </div>
      </div>

      {/* ── sheet ─────────────────────────────────────────────────────── */}
      <div
        className="auth-sheet scroll-thin fade-in relative -mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-tl-none rounded-tr-[6rem] sm:rounded-tr-[7.5rem] bg-[var(--bg)] px-5 pb-8 pt-6 text-[var(--text)] sm:-mt-8 sm:px-8 sm:pb-8 sm:pt-8 lg:-ml-9 lg:mt-0 lg:justify-center lg:overflow-visible lg:rounded-l-[3.5rem] lg:rounded-tr-none lg:px-12 lg:py-12 xl:px-16"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex w-full min-h-full max-w-sm flex-1 shrink-0 flex-col justify-between py-1 lg:max-w-md lg:justify-center lg:py-0 xl:max-w-lg">
          <div>
            <h1 className="text-[25px] font-bold leading-tight sm:text-[30px] lg:text-[36px] xl:text-[40px]">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)] sm:mt-1.5 sm:text-[14.5px] lg:text-[16px]">{subtitle}</p>}
            <div className="mt-3.5 sm:mt-5 lg:mt-7">{children}</div>
          </div>
          {footer && <div className="mt-3.5 pt-1 text-center text-[13px] text-[var(--text-muted)] sm:mt-5 sm:text-[14px] lg:text-[15px]">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/** The wordless mark, sized for the hero. */
export function AuthMark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size="lg" />
    </span>
  );
}

/**
 * A still of the hero constellation, hand-drawn rather than rendered. The
 * landing page can afford WebGL; a sign-in screen should not pay 150 kB for
 * decoration behind a password field.
 */
function ConstellationMark() {
  const nodes = [
    [18, 22], [46, 12], [74, 26], [88, 54], [70, 74], [40, 68], [14, 52], [58, 44], [30, 40], [84, 16],
  ] as const;
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [8, 7], [7, 1], [7, 4], [2, 9]] as const;

  return (
    <svg
      viewBox="0 0 100 86"
      aria-hidden
      className="pointer-events-none absolute -right-6 -top-4 h-44 w-44 text-[var(--ink-text)] opacity-[0.13] sm:h-64 sm:w-64 lg:hidden"
    >
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="currentColor" strokeWidth="0.6" />
      ))}
      {nodes.map(([x, y], i) => (
        i % 3 === 1
          ? <rect key={i} x={x - 2} y={y - 2} width="4" height="4" rx="0.6" fill="currentColor" />
          : <circle key={i} cx={x} cy={y} r="2.2" fill="currentColor" />
      ))}
    </svg>
  );
}

export function GoogleButton({ label = 'Continue with Google', next }: { label?: string; next?: string }) {
  // Supabase owns the OAuth handshake now. It returns to /auth/callback, which
  // exchanges the code for a session cookie and then forwards to `next`.
  const signIn = async () => {
    const target = next ? `?next=${encodeURIComponent(next)}` : '';
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback${target}` },
    });
  };

  return (
    <button type="button" onClick={signIn} className="btn btn-secondary btn-hero">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
          <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 010-4.22V7.05H2.18a11 11 0 000 9.9l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
      </span>
      {label}
    </button>
  );
}

export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-4 flex items-center gap-3 sm:my-6 lg:my-7">
      <div className="h-px flex-1 bg-current opacity-15" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-50 sm:text-[12px]">{label}</span>
      <div className="h-px flex-1 bg-current opacity-15" />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-[14px] bg-[var(--danger)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--bg)]" role="alert">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-[14px] bg-[var(--success)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--bg)]" role="status">
      {message}
    </div>
  );
}

/** Judge-friendly shortcut: one tap fills a seeded account, mascot and all. */
export function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const label = useT()('auth.demoAccounts');
  const accounts = [
    { email: 'owner@loop.dev', role: 'Owner' },
    { email: 'pm@loop.dev', role: 'PM' },
    { email: 'member@loop.dev', role: 'Member' },
    { email: 'client@loop.dev', role: 'Client' },
    { email: 'admin@loop.dev', role: 'Admin' },
  ];
  return (
    <div className="mt-4 sm:mt-6 lg:mt-7">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] opacity-60 sm:text-[12px]">
        {label}
      </p>
      <div className="mt-2.5 flex flex-wrap justify-center gap-2 sm:gap-2.5">
        {accounts.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account.email)}
            className="chip pl-2 pr-3 py-1.5 text-xs sm:text-sm font-medium hover:border-[var(--border-strong)] transition-colors"
          >
            <span
              className="inline-flex h-6 w-6 items-end justify-center overflow-hidden rounded-full bg-[var(--bg-inset)] text-[var(--text)] sm:h-6.5 sm:w-6.5"
              style={{ ['--mascot-paper' as string]: 'var(--surface)' }}
            >
              <Mascot id={mascotFor(account.email)} crop="bust" size="100%" />
            </span>
            {account.role}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Inherits its colour rather than naming one: these links appear both under
 * the panel on paper and inside it on ink, and a fixed `--text` would be
 * invisible in the second place.
 */
export const AuthFooterLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-semibold text-current underline underline-offset-4">
    {children}
  </Link>
);
