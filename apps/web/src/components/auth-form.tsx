'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { API_URL } from '@/lib/api';
import { Icon } from '@/components/icons';
import { Mascot, mascotFor } from '@/components/mascots';
import { ThemeToggle } from '@/components/providers/theme';

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

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--ink)] text-[var(--ink-text)] lg:flex-row">
      {/* ── hero ──────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-5 pb-14 sm:px-8 lg:flex lg:w-[44%] lg:shrink-0 lg:flex-col lg:pb-8"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <ConstellationMark />

        <header className="relative flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="-ml-1 inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[color-mix(in_oklab,var(--ink-text)_10%,transparent)]"
            aria-label="Go back"
          >
            <Icon.arrowLeft width={19} height={19} />
          </button>
          <ThemeToggle className="text-[var(--ink-text)] hover:bg-[color-mix(in_oklab,var(--ink-text)_10%,transparent)] hover:text-[var(--ink-text)]" />
        </header>

        <div className="relative mt-7 lg:mt-auto">
          <AuthMark />
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-muted)]">{tagline}</p>
        </div>
      </div>

      {/* ── sheet ─────────────────────────────────────────────────────── */}
      <div
        className="auth-sheet fade-in relative -mt-9 flex flex-1 flex-col rounded-tl-[3.5rem] bg-[var(--bg)] px-5 pb-8 pt-9 text-[var(--text)] sm:px-8 lg:-ml-9 lg:mt-0 lg:justify-center lg:rounded-l-[3.5rem] lg:rounded-tr-none lg:px-12 lg:py-12"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-[30px] font-bold leading-[1.1] sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-7 text-center text-[14px] text-[var(--text-muted)]">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/** The wordless mark, sized for the hero. */
export function AuthMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] bg-[var(--ink-text)] text-[var(--ink)]"
        aria-hidden
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 8.5a4.5 4.5 0 100 7h9a4.5 4.5 0 100-7h-9z" />
        </svg>
      </span>
      <span className="text-[19px] font-bold tracking-[-0.03em]">Loop</span>
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
      className="pointer-events-none absolute -right-6 -top-4 h-52 w-52 text-[var(--ink-text)] opacity-[0.13] sm:h-64 sm:w-64 lg:-right-10 lg:h-80 lg:w-80"
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

export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  return (
    <a href={`${API_URL}/api/auth/google`} className="btn btn-secondary btn-hero">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
          <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 010-4.22V7.05H2.18a11 11 0 000 9.9l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
      </span>
      {label}
    </a>
  );
}

export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-current opacity-15" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-50">{label}</span>
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
  const accounts = [
    { email: 'owner@loop.dev', role: 'Owner' },
    { email: 'pm@loop.dev', role: 'PM' },
    { email: 'member@loop.dev', role: 'Member' },
    { email: 'client@loop.dev', role: 'Client' },
    { email: 'admin@loop.dev', role: 'Admin' },
  ];
  return (
    <div className="mt-6">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] opacity-55">
        Demo accounts · password Password123
      </p>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        {accounts.map((account) => (
          <button key={account.email} type="button" onClick={() => onPick(account.email)} className="chip pl-1.5">
            <span
              className="inline-flex h-6 w-6 items-end justify-center overflow-hidden rounded-full bg-[var(--bg-inset)] text-[var(--text)]"
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
