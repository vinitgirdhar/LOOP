'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@loop/shared';
import { useAuth } from '@/components/providers/auth';
import { useSocket, useSocketEvent } from '@/components/providers/socket';
import { ThemeToggle } from '@/components/providers/theme';
import { Avatar, Menu, MenuItem, Spinner } from '@/components/ui';
import { Icon } from '@/components/icons';
import { Logo } from '@/components/marketing';
import { cx } from '@/lib/format';
import { api } from '@/lib/api';
import { navItems, type NavItem } from './nav-items';
import { CommandPalette } from './command-palette';
import { NotificationBell } from './notifications';
import { WorkspaceSwitcher } from './workspace-switcher';

export function AppShell({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, can, logout, memberships } = useAuth();
  const { connected } = useSocket();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  const items = navItems(workspaceId).filter((item) => !item.permission || can(item.permission));
  const workspace = memberships.find((m) => m.workspace.id === workspaceId)?.workspace;

  // Cmd/Ctrl+K anywhere, plus "/" when not typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName) || (event.target as HTMLElement)?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const loadBadges = useCallback(async () => {
    try {
      const [suggestions, channels] = await Promise.all([
        api.get<{ pending: number }>('/api/ai/suggestions?limit=1'),
        can('chat.read') ? api.get<{ unread: number }[]>('/api/chat/channels') : Promise.resolve({ data: [] as { unread: number }[] }),
      ]);
      setSuggestionCount(suggestions.data.pending);
      setChatUnread(channels.data.reduce((sum, c) => sum + (c.unread ?? 0), 0));
    } catch {
      /* badges are decoration */
    }
  }, [can]);

  useEffect(() => {
    void loadBadges();
  }, [loadBadges, workspaceId, pathname]);

  useSocketEvent('suggestion:new', () => setSuggestionCount((n) => n + 1));
  useSocketEvent('message:new', () => setChatUnread((n) => n + 1));

  const badgeFor = (item: NavItem) =>
    item.badge === 'suggestions' ? suggestionCount : item.badge === 'chat' ? chatUnread : 0;

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const primary = items.filter((item) => item.primary).slice(0, 4);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-subtle)] lg:flex-row">
      {/* ── desktop sidebar ─────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-[var(--surface)] lg:flex xl:w-64">
        <div className="px-3 py-3">
          <WorkspaceSwitcher workspaceId={workspaceId} />
        </div>

        <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" aria-label="Workspace">
          {items.map((item) => {
            const count = badgeFor(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                  isActive(item) ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-inset)] hover:text-[var(--text)]',
                )}
                aria-current={isActive(item) ? 'page' : undefined}
              >
                {(() => {
                  const IconComponent = Icon[item.icon];
                  return <IconComponent width={17} height={17} />;
                })()}
                <span className="flex-1 truncate">{item.label}</span>
                {count > 0 && (
                  <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-white">{count > 99 ? '99+' : count}</span>
                )}
              </Link>
            );
          })}

          {user?.isPlatformAdmin && (
            <Link
              href="/admin"
              className={cx(
                'mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                pathname.startsWith('/admin') ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-inset)] hover:text-[var(--text)]',
              )}
            >
              <Icon.shield width={17} height={17} />
              Admin panel
            </Link>
          )}
        </nav>

        <div className="border-t p-2">
          <Menu
            align="left"
            trigger={
              <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--bg-inset)]">
                <Avatar name={user?.name ?? '?'} src={user?.avatarUrl} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{user?.name}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{role ? ROLE_LABELS[role] : ''}</span>
                </span>
                <Icon.chevronDown width={14} height={14} className="text-[var(--text-faint)]" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuItem onClick={() => { close(); router.push('/profile'); }}>
                  <Icon.user width={15} height={15} /> Profile and security
                </MenuItem>
                <MenuItem onClick={() => { close(); router.push('/app'); }}>
                  <Icon.board width={15} height={15} /> Switch workspace
                </MenuItem>
                <div className="divider my-1" />
                <MenuItem danger onClick={() => { close(); void logout(); }}>
                  <Icon.logout width={15} height={15} /> Sign out
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </aside>

      {/* ── main column ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-[var(--surface)]/90 px-3 backdrop-blur-md sm:px-4">
          <button type="button" className="btn btn-ghost btn-icon lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Icon.menu />
          </button>
          <Link href={`/w/${workspaceId}`} className="lg:hidden">
            <Logo size="sm" />
          </Link>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] text-[var(--text-faint)] transition-colors hover:border-[var(--border-strong)] lg:ml-0 lg:w-72"
          >
            <Icon.search width={15} height={15} />
            <span className="hidden lg:inline">Search…</span>
            <kbd className="ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] lg:block">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-0.5">
            <span
              className={cx('mr-1 hidden h-1.5 w-1.5 rounded-full sm:block', connected ? 'bg-[var(--success)]' : 'bg-[var(--text-faint)]')}
              title={connected ? 'Live updates connected' : 'Reconnecting…'}
            />
            <ThemeToggle />
            <NotificationBell workspaceId={workspaceId} />
            <div className="lg:hidden">
              <Menu
                trigger={
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Account">
                    <Avatar name={user?.name ?? '?'} src={user?.avatarUrl} size={24} />
                  </button>
                }
              >
                {(close) => (
                  <>
                    <MenuItem onClick={() => { close(); router.push('/profile'); }}>Profile and security</MenuItem>
                    <MenuItem onClick={() => { close(); router.push('/app'); }}>Switch workspace</MenuItem>
                    {user?.isPlatformAdmin && <MenuItem onClick={() => { close(); router.push('/admin'); }}>Admin panel</MenuItem>}
                    <div className="divider my-1" />
                    <MenuItem danger onClick={() => { close(); void logout(); }}>Sign out</MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ── mobile bottom bar ───────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label="Primary"
      >
        {primary.map((item) => {
          const count = badgeFor(item);
          const IconComponent = Icon[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive(item) ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')}
            >
              <IconComponent width={19} height={19} />
              {item.label.split(' ')[0]}
              {count > 0 && <span className="absolute right-[22%] top-1 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />}
            </Link>
          );
        })}
        <button type="button" onClick={() => setDrawerOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-[var(--text-muted)]">
          <Icon.more width={19} height={19} />
          More
        </button>
      </nav>

      {/* ── mobile drawer ───────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setDrawerOpen(false)} aria-label="Close menu" />
          <div className="slide-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-2xl border-t bg-[var(--surface)]">
            <div className="mx-auto my-2 h-1 w-9 rounded-full bg-[var(--border-strong)]" />
            <div className="px-3 pb-2">
              <WorkspaceSwitcher workspaceId={workspaceId} />
            </div>
            <div className="scroll-thin grid max-h-[60vh] grid-cols-2 gap-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {items.map((item) => {
                const IconComponent = Icon[item.icon];
                const count = badgeFor(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-3 text-[13px] font-medium',
                      isActive(item) ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)]',
                    )}
                  >
                    <IconComponent width={17} height={17} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count > 0 && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-white">{count}</span>}
                  </Link>
                );
              })}
              {user?.isPlatformAdmin && (
                <Link href="/admin" className="flex items-center gap-2.5 rounded-xl border px-3 py-3 text-[13px] font-medium text-[var(--text-muted)]">
                  <Icon.shield width={17} height={17} /> Admin
                </Link>
              )}
              <button type="button" onClick={() => void logout()} className="flex items-center gap-2.5 rounded-xl border px-3 py-3 text-[13px] font-medium text-[var(--danger)]">
                <Icon.logout width={17} height={17} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export function ShellLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner size={24} />
    </div>
  );
}
