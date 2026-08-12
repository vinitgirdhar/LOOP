'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/providers/theme';
import { LocaleSwitcher, useT } from '@/components/providers/locale';
import { useAuth } from '@/components/providers/auth';
import { cx } from '@/lib/format';

/**
 * Official LOOP brand logo component using precise vector paths.
 * Automatically adapts text color based on light/dark mode theme.
 */
export function Logo({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const heights = { sm: 20, md: 25, lg: 32, xl: 40 };
  const h = heights[size] || 25;
  const w = Math.round(h * (856 / 259));

  return (
    <span className={cx('inline-flex items-center shrink-0 text-current', className)}>
      <svg
        width={w}
        height={h}
        viewBox="0 0 856 259"
        fill="currentColor"
        className="h-auto max-w-full text-current transition-opacity hover:opacity-90"
        aria-label="Loop Logo"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M 585.0 1.0 L 614.0 23.0 L 633.0 47.0 L 722.0 48.0 L 755.0 54.0 L 772.0 60.0 L 792.0 73.0 L 802.0 85.0 L 806.0 95.0 L 806.0 116.0 L 802.0 124.0 L 792.0 134.0 L 777.0 139.0 L 761.0 138.0 L 743.0 130.0 L 725.0 111.0 L 711.0 83.0 L 706.0 61.0 L 657.0 62.0 L 658.0 257.0 L 705.0 257.0 L 706.0 155.0 L 715.0 165.0 L 738.0 179.0 L 760.0 185.0 L 784.0 185.0 L 806.0 179.0 L 822.0 170.0 L 838.0 155.0 L 846.0 143.0 L 852.0 129.0 L 855.0 113.0 L 855.0 98.0 L 851.0 78.0 L 843.0 60.0 L 833.0 46.0 L 823.0 36.0 L 803.0 22.0 L 772.0 9.0 L 729.0 1.0 Z M 0.0 1.0 L 1.0 258.0 L 179.0 257.0 L 161.0 245.0 L 146.0 232.0 L 132.0 216.0 L 128.0 209.0 L 49.0 207.0 L 48.0 1.0 Z M 639.0 115.0 L 632.0 87.0 L 620.0 63.0 L 603.0 41.0 L 577.0 20.0 L 526.0 1.0 L 469.0 4.0 L 433.0 19.0 L 397.0 50.0 L 374.0 84.0 L 338.0 160.0 L 315.0 188.0 L 293.0 202.0 L 274.0 208.0 L 231.0 206.0 L 197.0 187.0 L 181.0 168.0 L 172.0 148.0 L 171.0 111.0 L 190.0 74.0 L 208.0 59.0 L 243.0 47.0 L 269.0 49.0 L 297.0 63.0 L 312.0 80.0 L 322.0 108.0 L 320.0 138.0 L 300.0 174.0 L 325.0 143.0 L 358.0 69.0 L 342.0 42.0 L 309.0 15.0 L 272.0 2.0 L 235.0 1.0 L 189.0 15.0 L 148.0 49.0 L 127.0 88.0 L 121.0 135.0 L 125.0 159.0 L 140.0 193.0 L 178.0 233.0 L 226.0 255.0 L 245.0 258.0 L 286.0 255.0 L 331.0 236.0 L 364.0 206.0 L 388.0 169.0 L 418.0 103.0 L 445.0 68.0 L 484.0 49.0 L 514.0 47.0 L 533.0 51.0 L 564.0 69.0 L 579.0 86.0 L 589.0 107.0 L 591.0 143.0 L 575.0 178.0 L 550.0 199.0 L 518.0 209.0 L 489.0 206.0 L 462.0 191.0 L 443.0 164.0 L 438.0 134.0 L 444.0 109.0 L 463.0 80.0 L 438.0 110.0 L 402.0 184.0 L 422.0 218.0 L 452.0 242.0 L 486.0 255.0 L 523.0 257.0 L 552.0 251.0 L 576.0 240.0 L 608.0 213.0 L 633.0 170.0 L 639.0 143.0 Z"
        />
      </svg>
    </span>
  );
}

const NAV = [
  { href: '/#features', key: 'nav.features' },
  { href: '/#pricing', key: 'nav.pricing' },
  { href: '/#testimonials', key: 'nav.customers' },
  { href: '/#faq', key: 'nav.faq' },
  { href: '/blog', key: 'nav.blog' },
  { href: '/#contact', key: 'nav.contact' },
] as const;

export function MarketingNav() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, ready } = useAuth();

  /*
    The left slot carries the wordmark while the hero is on screen and becomes
    the menu button once the reader starts scrolling. It is one control the
    whole time — tapping the mark opens the menu too — which is what lets the
    bar hold a single action on the right instead of crowding three.
  */
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 24);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--bg)]/85 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] items-center gap-3 px-4 sm:px-6" aria-label="Main">
        {/* Mobile: one left control, wordmark → menu icon on scroll. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-ml-1 flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-1 transition-colors hover:bg-[var(--bg-inset)] lg:hidden"
        >
          {open ? <Icon.close width={18} height={18} /> : scrolled ? <Icon.menu width={19} height={19} /> : <Logo />}
        </button>

        {/* Desktop keeps the mark as a link home, with the section nav beside it. */}
        <Link href="/" className="hidden shrink-0 lg:block">
          <Logo />
        </Link>

        <div className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-inset)] hover:text-[var(--text)] 2xl:text-sm">
              {t(item.key)}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle />
          {ready && user ? (
            <Link href="/app" className="btn btn-primary btn-sm">
              {t('nav.openApp')}
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">
                {t('nav.signIn')}
              </Link>
              {/* Last in the row, so it sits hard against the right edge. */}
              <Link href="/welcome" className="btn btn-primary btn-sm">
                {t('nav.getStarted')}
              </Link>
            </>
          )}
        </div>
      </nav>

      {open && (
        <div className="fade-in border-t px-4 py-2 lg:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-inset)]">
              {t(item.key)}
            </Link>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-sm font-medium sm:hidden">
            {t('nav.signIn')}
          </Link>
        </div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t bg-[var(--bg-subtle)]">
      {/*
        Three columns at every width. Stacking them on a phone turned the footer
        into a third of the page for six links, and the mark and blurb above
        them repeated what the top of the page already said.
      */}
      <div className="mx-auto grid max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] grid-cols-3 gap-x-4 gap-y-8 px-4 py-8 sm:gap-x-8 sm:px-6 sm:py-10">
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
            // Short enough to survive a third of a phone's width.
            { href: '/blog/explainable-health-score', label: 'Health score' },
            { href: '/blog/permission-aware-rag', label: 'Permission-aware RAG' },
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
      <div className="border-t px-4 py-4 text-center text-[11px] leading-relaxed text-[var(--text-faint)] sm:px-6">
        © {new Date().getFullYear()} Loop. Built for DevFusion 4.0 · Problem Statement 5.
        <span className="block sm:inline"> Built by <span className="font-medium text-[var(--text-muted)]">Vinit Girdhar</span>.</span>
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
