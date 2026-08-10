export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const future = seconds < 0;
  const abs = Math.abs(seconds);

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86_400, 'hour'],
    [604_800, 'day'],
    [2_592_000, 'week'],
    [31_536_000, 'month'],
  ];

  if (abs < 45) return future ? 'in a moment' : 'just now';
  for (const [limit, unit] of units) {
    if (abs < limit) continue;
    const nextIndex = units.findIndex(([l]) => l === limit) + 1;
    const next = units[nextIndex];
    if (!next || abs < next[0]) {
      const divisor = limit;
      const amount = Math.round(abs / divisor);
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(future ? amount : -amount, unit);
    }
  }
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(future ? 1 : -1, 'year');
}

export function formatDate(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export const formatDateTime = (value: string | Date | null | undefined) =>
  formatDate(value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatShortDate = (value: string | Date | null | undefined) => formatDate(value, { day: 'numeric', month: 'short' });

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
}

/**
 * Time-of-day greeting. Reads the local clock, so only call it from a tree
 * that renders after mount — on the server it would disagree with the client.
 */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function isOverdue(due: string | Date | null | undefined, completed?: string | null): boolean {
  if (!due || completed) return false;
  return new Date(due).getTime() < Date.now();
}

export const PRIORITY_STYLE: Record<string, { label: string; className: string }> = {
  URGENT: { label: 'Urgent', className: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/25' },
  HIGH: { label: 'High', className: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/25' },
  MEDIUM: { label: 'Medium', className: 'bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]/25' },
  LOW: { label: 'Low', className: 'bg-[var(--bg-inset)] text-[var(--text-muted)] border-[var(--border)]' },
};

export const STATUS_STYLE: Record<string, string> = {
  PLANNING: 'bg-[var(--bg-inset)] text-[var(--text-muted)]',
  ACTIVE: 'bg-[var(--success-soft)] text-[var(--success)]',
  ON_HOLD: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  COMPLETED: 'bg-[var(--info-soft)] text-[var(--info)]',
  ARCHIVED: 'bg-[var(--bg-inset)] text-[var(--text-faint)]',
};

export function healthTone(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Healthy', color: 'var(--success)' };
  if (score >= 60) return { label: 'Watch', color: 'var(--warning)' };
  if (score >= 40) return { label: 'At risk', color: '#f97316' };
  return { label: 'Critical', color: 'var(--danger)' };
}
