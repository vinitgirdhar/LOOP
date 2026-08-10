'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { useState } from 'react';
import { ThemeToggle } from '@/components/providers/theme';
import { useAuth } from '@/components/providers/auth';
import { cx } from '@/lib/format';

/**
 * The mark is drawn rather than typed: a text arrow glyph rendered as a
 * different shape on every platform, and turned into an emoji on iOS.
 */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 24 : 28;
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-flex shrink-0 items-center justify-center bg-[var(--ink)] text-[var(--ink-text)]"
        style={{ width: box, height: box, borderRadius: box * 0.34 }}
        aria-hidden
      >
        <svg width={box * 0.62} height={box * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 8.5a4.5 4.5 0 100 7h9a4.5 4.5 0 100-7h-9z" />
        </svg>
      </span>
      <span className={cx('font-semibold tracking-[-0.02em]', size === 'sm' ? 'text-sm' : 'text-[15px]')}>Loop</span>
    </span>
  );
}

const NAV = [
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#testimonials', label: 'Customers' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/blog', label: 'Blog' },
  { href: '/#contact', label: 'Contact' },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const { user, ready } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--bg)]/85 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] items-center gap-3 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <div className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-inset)] hover:text-[var(--text)] 2xl:text-sm">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {ready && user ? (
            <Link href="/app" className="btn btn-primary btn-sm">
              Open app
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">
                Sign in
              </Link>
              {/* First-time visitors meet the three mascots before the form. */}
              <Link href="/welcome" className="btn btn-primary btn-sm">
                Get started
              </Link>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm lg:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Toggle menu">
            {open ? <Icon.close width={16} height={16} /> : <Icon.menu width={17} height={17} />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="fade-in border-t px-4 py-2 lg:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-inset)]">
              {item.label}
            </Link>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-sm font-medium sm:hidden">
            Sign in
          </Link>
        </div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t bg-[var(--bg-subtle)]">
      <div className="mx-auto grid max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-[var(--text-muted)]">
            One workspace for projects, docs and chat — with an AI layer that shows its evidence every time.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            { href: '/#features', label: 'Features' },
            { href: '/#pricing', label: 'Pricing' },
            { href: '/#faq', label: 'FAQ' },
            { href: '/blog', label: 'Blog' },
          ]}
        />
        <FooterColumn
          title="Developers"
          links={[
            { href: '/api/health', label: 'Status', external: true },
            { href: '/blog/explainable-health-score', label: 'How the health score works' },
          ]}
        />
        <FooterColumn
          title="Company"
          links={[
            { href: '/#contact', label: 'Contact' },
            { href: '/#testimonials', label: 'Customers' },
            { href: '/login', label: 'Sign in' },
          ]}
        />
      </div>
      <div className="border-t px-4 py-4 text-center text-[11px] text-[var(--text-faint)] sm:px-6">
        © {new Date().getFullYear()} Loop. Built for DevFusion 4.0 · Problem Statement 5.
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string; external?: boolean }[] }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{title}</p>
      <ul className="space-y-1.5">
        {links.map((link) => (
          <li key={link.label}>
            {link.external ? (
              <a href={link.href} target="_blank" rel="noreferrer" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                {link.label} ↗
              </a>
            ) : (
              <Link href={link.href} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y rounded-xl border">
      {items.map((item, index) => (
        <div key={item.q}>
          <button
            type="button"
            onClick={() => setOpen(open === index ? null : index)}
            aria-expanded={open === index}
            className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-sm font-medium"
          >
            {item.q}
            <span className={cx('shrink-0 text-[var(--text-faint)] transition-transform', open === index && 'rotate-45')}>+</span>
          </button>
          {open === index && <p className="px-4 pb-4 text-[13px] leading-relaxed text-[var(--text-muted)]">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}

export function ContactForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-6 text-center text-sm text-[var(--success)]">
        Thanks — we will get back to you within one working day.
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" name="name" placeholder="Your name" required autoComplete="name" />
        <input className="input" type="email" name="email" placeholder="Work email" required autoComplete="email" />
      </div>
      <textarea className="textarea" name="message" placeholder="What are you trying to fix?" required />
      <button type="submit" className="btn btn-primary w-full sm:w-auto">
        Send message
      </button>
    </form>
  );
}
