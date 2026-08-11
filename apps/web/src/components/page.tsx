'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 sm:py-6', className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
}) {
  return (
    <div className="mb-4 sm:mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          <Icon.arrowLeft width={13} height={13} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-[-0.02em] sm:text-xl">{title}</h1>
          {subtitle && <div className="mt-1 text-[13px] text-[var(--text-muted)]">{subtitle}</div>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A figure, optionally a way in.
 *
 * A count is a question — "which twelve?" — and the answer is always a list
 * that already exists. Given an `href` the tile becomes that link and says so
 * on hover; without one it stays a plain figure rather than pretending.
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums tracking-[-0.02em]" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </>
  );

  if (!href) return <div className="card p-3.5">{body}</div>;

  return (
    <Link
      href={href}
      className="card group block p-3.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-inset)]"
    >
      {body}
    </Link>
  );
}
