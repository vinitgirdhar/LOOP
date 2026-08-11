'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { cx, initials } from '@/lib/format';
import { useLockScroll } from '@/lib/hooks';
import { Mascot, mascotFor } from '@/components/mascots';

/* ── button ──────────────────────────────────────────────────────────── */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', !children && 'btn-icon', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export const Spinner = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);

/* ── form fields ─────────────────────────────────────────────────────── */

export function Field({ label, hint, error, children, required }: { label?: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      {label && (
        <span className="label">
          {label}
          {required && <span className="text-[var(--danger)]"> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="field-error mt-1.5 block">{error}</span>
      ) : hint ? (
        <span className="field-hint mt-1.5 block">{hint}</span>
      ) : null}
    </label>
  );
}

/* ── surfaces ────────────────────────────────────────────────────────── */

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cx('card', padded && 'p-4 sm:p-5', className)}>{children}</div>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }) {
  const tones = {
    success: 'bg-[var(--success-soft)] text-[var(--success)]',
    warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
    info: 'bg-[var(--info-soft)] text-[var(--info)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    neutral: 'bg-[var(--bg-inset)] text-[var(--text-muted)]',
  };
  return <span className={cx('badge', tone && tones[tone], className)}>{children}</span>;
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  /** Stable id for the mascot draw — falls back to the name when absent. */
  seed?: string | null;
  /** Workspaces and projects keep a monogram; only people get a face. */
  kind?: 'person' | 'workspace';
}

/**
 * One avatar for the whole app. With no picture of their own a person gets one
 * of the three mascots, chosen from their id so it never changes between
 * screens or sessions; a workspace gets its monogram instead.
 */
export function Avatar({ name, src, size = 28, className, seed, kind = 'person' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(9, size * 0.38) };

  if (src && !failed) {
    // Not next/image: the source may be a blob: preview of a file the reader
    // has not uploaded yet, which the optimiser cannot fetch, and the onError
    // fallback to initials is the whole reason this branch exists.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        title={name}
        onError={() => setFailed(true)}
        style={style}
        className={cx('shrink-0 rounded-full bg-[var(--bg-inset)] object-cover', className)}
      />
    );
  }

  if (kind === 'workspace') {
    return (
      <span
        style={{ ...style, borderRadius: Math.max(7, size * 0.3) }}
        title={name}
        className={cx('inline-flex shrink-0 items-center justify-center bg-[var(--ink)] font-semibold text-[var(--ink-text)]', className)}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span
      style={{ ...style, ['--mascot-paper' as string]: 'var(--surface)' }}
      title={name}
      className={cx('inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-[var(--bg-inset)] text-[var(--text)]', className)}
    >
      <Mascot id={mascotFor(seed ?? name)} crop="bust" size="100%" />
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 24 }: { people: { id: string; name: string; avatarUrl?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((person) => (
        <Avatar key={person.id} seed={person.id} name={person.name} src={person.avatarUrl} size={size} className="ring-2 ring-[var(--surface)]" />
      ))}
      {extra > 0 && (
        <span
          style={{ width: size, height: size, fontSize: size * 0.36 }}
          className="inline-flex items-center justify-center rounded-full bg-[var(--bg-inset)] font-semibold text-[var(--text-muted)] ring-2 ring-[var(--surface)]"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ── feedback ────────────────────────────────────────────────────────── */

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} />;

export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      {icon && <div className="mb-3 text-[var(--text-faint)]">{icon}</div>}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold underline">
          Try again
        </button>
      )}
    </div>
  );
}

/* ── overlays ────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useLockScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div
        className={cx(
          'sheet-in relative flex max-h-[90dvh] w-full flex-col rounded-t-[28px] border border-b-0 bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:max-h-[85dvh] sm:rounded-[24px] sm:border-b',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <span className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)] sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm -mr-1" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Bottom sheet for touch. Used for the surfaces a thumb reaches for — the
 * navigation drawer's siblings, quick actions — where a centred dialog would
 * sit under the notch on a small phone.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  useLockScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="sheet-in relative flex max-h-[85dvh] w-full flex-col rounded-t-[28px] border border-b-0 bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:max-w-sm sm:rounded-[24px] sm:border-b">
        <span className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)] sm:hidden" aria-hidden />
        <div className="px-4 pb-1 pt-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export const CloseIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

type MenuPlacement = { top?: number; bottom?: number; left?: number; right?: number; maxHeight: number };

/**
 * Dropdown menu.
 *
 * Positioned `fixed` against the trigger rather than absolutely inside it: the
 * account menu lives at the very bottom of the sidebar, and an absolutely
 * positioned panel there opened *below* the fold where Sign out could never be
 * clicked. Measuring the trigger lets the panel flip above when there is no room
 * below, and escape the `overflow: hidden` of any ancestor.
 */
export function Menu({
  trigger,
  children,
  align = 'right',
  className,
  label,
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const position = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;

    const margin = 8;
    const gap = 6;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    // Flip up only when below genuinely cannot hold a usable menu.
    const dropUp = below < 200 && above > below;

    setPlacement({
      ...(dropUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      ...(align === 'right'
        ? { right: Math.max(margin, window.innerWidth - rect.right) }
        : { left: Math.min(Math.max(margin, rect.left), window.innerWidth - margin) }),
      maxHeight: Math.max(160, (dropUp ? above : below) - gap),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    const onChange = () => position();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (anchor.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      anchor.current?.querySelector('button')?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <div
        ref={anchor}
        className={cx('inline-flex', className)}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {trigger}
      </div>
      {open && (
        <div
          ref={panel}
          role="menu"
          style={{ ...placement, visibility: placement ? 'visible' : 'hidden' }}
          className="menu-panel fade-in scroll-thin fixed z-[70] min-w-48 max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overflow-x-hidden rounded-xl border bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  href,
  danger,
  disabled,
  selected,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  selected?: boolean;
}) {
  const className = cx(
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-40',
    danger ? 'text-[var(--danger)] hover:bg-[var(--danger-soft)]' : 'hover:bg-[var(--bg-inset)]',
    selected && 'font-medium text-[var(--accent)]',
  );

  // A link inside a button is invalid markup and swallows the navigation, so
  // menu rows that navigate render as anchors instead.
  if (href) {
    return (
      <Link href={href} role="menuitem" className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{children}</p>
);

/**
 * Segmented control — the pill track from the design language. Scrolls
 * sideways on a narrow phone rather than squeezing labels into two words each.
 */
export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="segmented w-full min-w-max" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => onChange(tab.key)}
            className={cx('segmented-item', active === tab.key && 'segmented-item-active')}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 opacity-60">{tab.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Horizontally scrolling filter pills. */
export function ChipRow({ items, active, onChange, className }: { items: { key: string; label: string }[]; active: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div className={cx('no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={active === item.key}
          onClick={() => onChange(item.key)}
          className={cx('chip', active === item.key && 'chip-active')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Toggle switch. Renders a real checkbox underneath so it stays operable by keyboard and screen reader. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-3', disabled && 'opacity-50')}>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-[13px] font-medium">{label}</span>
      <span
        className={cx('switch ml-auto peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]', checked && 'switch-on')}
        aria-hidden
      >
        <span className="switch-knob" />
      </span>
    </label>
  );
}

export function Progress({ value, tone = 'var(--accent)', height = 6 }: { value: number; tone?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-[var(--bg-inset)]" style={{ height }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: tone }} />
    </div>
  );
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
    </Modal>
  );
}

/** Copies text and shows a short confirmation in place. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}
