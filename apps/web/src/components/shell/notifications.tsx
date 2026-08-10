'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Avatar, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/components/providers/socket';
import { useClickOutside } from '@/lib/hooks';
import { cx, relativeTime } from '@/lib/format';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

const TYPE_ICON: Record<string, keyof typeof Icon> = {
  TASK_ASSIGNED: 'check',
  TASK_COMPLETED: 'check',
  DEADLINE_REMINDER: 'clock',
  MENTION: 'chat',
  FILE_UPLOADED: 'folder',
  COMMENT_ADDED: 'chat',
  SPRINT_STARTED: 'sprint',
  SPRINT_ENDED: 'sprint',
  SUGGESTION: 'bolt',
  INVITE: 'users',
};

export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ items: NotificationRow[]; unread: number }>('/api/notifications?limit=15');
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      /* the bell is not worth an error banner */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, workspaceId]);

  useSocketEvent<NotificationRow>('notification:new', (payload) => {
    setItems((current) => [payload, ...current].slice(0, 15));
    setUnread((n) => n + 1);
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-icon relative"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Icon.bell />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fade-in fixed inset-x-2 top-[calc(var(--header-h)+var(--safe-top)+0.25rem)] z-[70] overflow-hidden rounded-xl border bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-1 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b px-3.5 py-2.5">
            <p className="text-[13px] font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                onClick={async () => {
                  await api.post('/api/notifications/read-all');
                  setItems((current) => current.map((n) => ({ ...n, readAt: new Date().toISOString() })));
                  setUnread(0);
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="scroll-thin max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-contain">
            {loading && items.length === 0 ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">Nothing yet — you are all caught up.</p>
            ) : (
              items.map((item) => {
                const IconComponent = Icon[TYPE_ICON[item.type] ?? 'bell'];
                const content = (
                  <div className={cx('flex gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-[var(--bg-inset)]', !item.readAt && 'bg-[var(--accent-soft)]/40')}>
                    {item.actor ? (
                      <Avatar name={item.actor.name} src={item.actor.avatarUrl} size={26} />
                    ) : (
                      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--bg-inset)] text-[var(--text-muted)]">
                        <IconComponent width={13} height={13} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug">{item.title}</p>
                      {item.body && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">{item.body}</p>}
                      <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">{relativeTime(item.createdAt)}</p>
                    </div>
                    {!item.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
                  </div>
                );

                return item.link ? (
                  <Link
                    key={item.id}
                    href={item.link}
                    onClick={() => {
                      setOpen(false);
                      if (!item.readAt) {
                        void api.post(`/api/notifications/${item.id}/read`);
                        setUnread((n) => Math.max(0, n - 1));
                      }
                    }}
                    className="block border-b last:border-b-0"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={item.id} className="border-b last:border-b-0">
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
