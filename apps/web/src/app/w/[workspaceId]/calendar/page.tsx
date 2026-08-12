'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Avatar, Badge, Button, Card, EmptyState, SectionTitle, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { cx, formatShortDate } from '@/lib/format';

interface CalendarEvent {
  id: string;
  type: 'task' | 'meeting' | 'sprint' | 'holiday' | 'milestone';
  title: string;
  date: string;
  endDate?: string;
  done?: boolean;
  color: string;
  link: string | null;
}

interface Availability {
  user: { id: string; name: string; avatarUrl: string | null };
  capacityHours: number;
  meetingHours: number;
  freeHours: number;
}

/**
 * A date's own calendar day, in local time.
 *
 * `toISOString().slice(0, 10)` is UTC, so anything after 18:30 in IST lands in
 * the following day's cell - the kind of off-by-one that makes a calendar
 * quietly untrustworthy.
 */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Meetings show a start time; all-day things (deadlines, sprints) do not. */
function eventTime(event: { type: string; date: string }): string {
  if (event.type !== 'meeting') return '';
  return new Date(event.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const TYPE_LABEL = { task: 'Deadline', meeting: 'Meeting', sprint: 'Sprint', holiday: 'Holiday', milestone: 'Milestone' } as const;

export default function CalendarPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<'month' | 'agenda'>('month');

  const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString();
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0).toISOString();

  const { data: events, loading } = useQuery<CalendarEvent[]>(`/api/calendar?from=${from}&to=${to}`, [from, to, workspaceId]);
  const { data: availability } = useQuery<Availability[]>('/api/calendar/availability', [workspaceId]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events ?? []) {
      const key = localDay(new Date(event.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  /**
   * Six full weeks, the way Google Calendar draws a month.
   *
   * The leading and trailing cells carry the real neighbouring dates rather
   * than being blank: a deadline on the 1st of next month is still the thing
   * you opened the calendar to find, and an empty grey box hides it. The row
   * count is fixed so the grid does not change height between months.
   */
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, outside: date.getMonth() !== cursor.getMonth() };
    });
  }, [cursor]);

  const upcoming = (events ?? []).filter((event) => new Date(event.date).getTime() >= Date.now() - 86_400_000).slice(0, 25);
  const today = localDay(new Date());

  return (
    <Page>
      <PageHeader
        title="Calendar"
        subtitle="Deadlines, meetings, sprint boundaries, milestones and holidays in one feed"
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
              <button type="button" onClick={() => setView('month')} className={cx('rounded-md px-2 py-1 text-xs font-medium', view === 'month' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)]')}>
                Month
              </button>
              <button type="button" onClick={() => setView('agenda')} className={cx('rounded-md px-2 py-1 text-xs font-medium', view === 'agenda' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)]')}>
                Agenda
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const now = new Date();
                setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
            >
              Today
            </Button>
            <Button size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
              ←
            </Button>
            <span className="min-w-32 text-center text-[13px] font-semibold">
              {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </span>
            <Button size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
              →
            </Button>
          </>
        }
      />

      {loading && !events ? (
        <Skeleton className="h-96 w-full" />
      ) : view === 'month' ? (
        <Card padded={false} className="overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-[var(--bg-subtle)] text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="py-1.5">
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map(({ date, outside }) => {
              const key = localDay(date);
              const dayEvents = byDay.get(key) ?? [];
              const isToday = key === today;
              return (
                <div
                  key={key}
                  className={cx(
                    'min-h-[5.5rem] border-b border-r p-1 sm:min-h-28',
                    // Outside days stay legible but recede, the way they do in
                    // Google Calendar, rather than being blank grey boxes.
                    outside && 'bg-[var(--bg-subtle)]/60',
                  )}
                >
                  <div className="mb-1 flex justify-center sm:justify-start">
                    <span
                      className={cx(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums',
                        isToday
                          ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                          : outside
                            ? 'text-[var(--text-faint)]'
                            : 'text-[var(--text-muted)]',
                      )}
                    >
                      {date.getDate()}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => {
                      const chipClass = 'block truncate rounded px-1 py-0.5 text-[10px] leading-tight';
                      const chipStyle = { background: `${event.color}22`, color: event.color };
                      const label = eventTime(event);
                      const inner = (
                        <>
                          {label && <span className="mr-1 hidden opacity-70 sm:inline">{label}</span>}
                          {event.title}
                        </>
                      );
                      return event.link ? (
                        <Link key={event.id} href={event.link} className={chipClass} style={chipStyle} title={event.title}>
                          {inner}
                        </Link>
                      ) : (
                        <span key={event.id} className={chipClass} style={chipStyle} title={event.title}>
                          {inner}
                        </span>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <p className="px-1 text-[9px] font-medium text-[var(--text-faint)]">+{dayEvents.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : upcoming.length === 0 ? (
        <EmptyState title="Nothing scheduled" description="Task deadlines, meetings and sprint dates will appear here." icon={<Icon.calendar width={26} height={26} />} />
      ) : (
        <Card padded={false}>
          <ul className="divide-y">
            {upcoming.map((event) => (
              <li key={event.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: event.color }} />
                <div className="min-w-0 flex-1">
                  {event.link ? (
                    <Link href={event.link} className="truncate text-[13px] font-medium hover:underline">
                      {event.title}
                    </Link>
                  ) : (
                    <p className="truncate text-[13px] font-medium">{event.title}</p>
                  )}
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {TYPE_LABEL[event.type]} · {formatShortDate(event.date)}
                  </p>
                </div>
                {event.done && <Badge tone="success">done</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {availability && availability.length > 0 && (
        <Card className="mt-4">
          <SectionTitle title="Team availability" subtitle="Free hours in the next seven days, after booked meetings" />
          <ul className="space-y-2">
            {availability.map((row) => (
              <li key={row.user.id} className="flex items-center gap-2.5">
                <Avatar seed={row.user.id} name={row.user.name} src={row.user.avatarUrl} size={26} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{row.user.name}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{row.meetingHours}h in meetings</span>
                <span className="badge bg-[var(--success-soft)] text-[var(--success)]">{row.freeHours}h free</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
