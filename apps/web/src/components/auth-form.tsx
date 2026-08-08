'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { API_URL } from '@/lib/api';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fade-in">
      <h1 className="text-xl font-bold tracking-[-0.02em]">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>}
      <div className="mt-5">{children}</div>
      {footer && <div className="mt-5 text-center text-[13px] text-[var(--text-muted)]">{footer}</div>}
    </div>
  );
}

export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  return (
    <a href={`${API_URL}/api/auth/google`} className="btn btn-secondary w-full">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
        <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 010-4.22V7.05H2.18a11 11 0 000 9.9l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      {label}
    </a>
  );
}

export function AuthDivider() {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[11px] uppercase tracking-wider text-[var(--text-faint)]">or</span>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]" role="alert">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] px-3 py-2 text-[13px] text-[var(--success)]" role="status">
      {message}
    </div>
  );
}

export function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const accounts = [
    { email: 'owner@loop.dev', role: 'Owner' },
    { email: 'pm@loop.dev', role: 'PM' },
    { email: 'member@loop.dev', role: 'Member' },
    { email: 'client@loop.dev', role: 'Client' },
    { email: 'admin@loop.dev', role: 'Admin' },
  ];
  return (
    <div className="mt-6 rounded-xl border border-dashed p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Demo accounts · password Password123</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {accounts.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account.email)}
            className="rounded-lg border px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {account.role}
          </button>
        ))}
      </div>
    </div>
  );
}

export const AuthFooterLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="link font-medium">
    {children}
  </Link>
);
