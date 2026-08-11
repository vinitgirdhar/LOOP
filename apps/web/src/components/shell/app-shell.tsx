'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROLE_LABELS } from '@loop/shared';
import { useAuth } from '@/components/providers/auth';
import { useSocket, useSocketEvent } from '@/components/providers/socket';
import { ThemeToggle } from '@/components/providers/theme';
import { Avatar, Menu, MenuItem, Spinner } from '@/components/ui';
import { Icon } from '@/components/icons';
import { Logo } from '@/components/marketing';
import { cx } from '@/lib/format';
import { api } from '@/lib/api';
import { NAV_GROUP_LABELS, bottomNavItems, navItems, quickActions, type NavGroup, type NavItem } from './nav-items';
import { CommandPalette } from './command-palette';
import { NotificationBell } from './notifications';
import { WorkspaceSwitcher } from './workspace-switcher';
import { MobileDrawer } from './mobile-drawer';
import { QuickCreate } from './quick-create';

const GROUP_ORDER: NavGroup[] = ['work', 'knowledge', 'insights', 'workspace'];

export function AppShell({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const pathname = usePathname();
  const { user, role, can, logout, memberships } = useAuth();
  const { connected } = useSocket();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  const items = useMemo(
    () => navItems(workspaceId).filter((item) => !item.permission || can(item.permission)),
    [workspaceId, can],
  );

  /** The four the bottom bar carries — excluded from the drawer so nothing repeats. */
  const barItems = useMemo(() => bottomNavItems(items, role), [items, role]);
  // Workspace settings stays in the list: the drawer renders it under Account,
  // not among the navigation groups.
  const drawerItems = useMemo(() => items.filter((item) => !barItems.includes(item)), [items, barItems]);
  const hasQuickActions = quickActions(workspaceId).some((action) => !action.permission || can(action.permission));
  const workspace = memberships.find((m) => m.workspace.id === workspaceId)?.workspace;

  // Cmd/Ctrl+K anywhere, plus "/" when not typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') || target?.isContentEditable;
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

  useEffect(() => {
    setDrawerOpen(false);
    setCreateOpen(false);
  }, [pathname]);

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

  // Once per workspace, not once per navigation. Refetching these on every
  // pathname change put two extra API calls in front of every tap, which is
  // most of why moving between sections felt slow.
  useEffect(() => {
    void loadBadges();
  }, [loadBadges, workspaceId]);

  // Opening chat marks the channel read server-side; reflect that here rather
  // than paying for a badge refetch on every navigation.
  useEffect(() => {
    if (pathname.startsWith(`/w/${workspaceId}/chat`)) setChatUnread(0);
  }, [pathname, workspaceId]);

  useSocketEvent('suggestion:new', () => setSuggestionCount((n) => n + 1));
  useSocketEvent<{ author?: { id: string }; channelId?: string }>('message:new', (message) => {
    // Your own messages, and the channel already on screen, are not unread.
    if (message?.author?.id === user?.id) return;
    if (pathname.startsWith(`/w/${workspaceId}/chat`)) return;
    setChatUnread((n) => n + 1);
  });

  const badgeFor = useCallback(
    (item: NavItem) => (item.badge === 'suggestions' ? suggestionCount : item.badge === 'chat' ? chatUnread : 0),
    [suggestionCount, chatUnread],
  );

  const isActive = useCallback(
    (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)),
    [pathname],
  );

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-[var(--bg-subtle)] lg:flex-row">
      {/* ── desktop sidebar ─────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-[var(--surface)] lg:flex xl:w-64">
        <div className="px-3 py-3">
          <WorkspaceSwitcher workspaceId={workspaceId} />
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-3" aria-label="Workspace">
          {GROUP_ORDER.map((group) => {
            const rows = items.filter((item) => item.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} className="mb-2">
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{NAV_GROUP_LABELS[group]}</p>
                {rows.map((item) => {
                  const count = badgeFor(item);
                  const ItemIcon = Icon[item.icon];
                  const active = isActive(item);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx('nav-row', active && 'nav-row-active')}
                    >
                      <ItemIcon width={17} height={17} className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && <span className="badge-count">{count > 99 ? '99+' : count}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          {user?.isPlatformAdmin && (
            <Link href="/admin" className={cx('nav-row', pathname.startsWith('/admin') && 'nav-row-active')}>
              <Icon.shield width={17} height={17} className="shrink-0" />
              <span className="flex-1 truncate">Admin panel</span>
            </Link>
          )}
        </nav>

        <div className="border-t p-2">
          <Menu
            align="left"
            className="w-full"
            label="Account menu"
            trigger={
              <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--bg-inset)]">
                <Avatar seed={user?.id} name={user?.name ?? "?"} src={user?.avatarUrl} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{user?.name}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{role ? ROLE_LABELS[role] : ''}</span>
                </span>
                <Icon.chevronDown width={14} height={14} className="shrink-0 text-[var(--text-faint)]" />
              </button>
            }
          >
            {(close) => (
              <>
                <div className="border-b px-3 pb-2 pt-1.5">
                  <p className="truncate text-[13px] font-medium">{user?.name}</p>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">{user?.email}</p>
                </div>
                <MenuItem href="/profile" onClick={close}>
                  <Icon.user width={15} height={15} /> Profile and security
                </MenuItem>
                <MenuItem href="/app" onClick={close}>
                  <Icon.board width={15} height={15} /> All workspaces
                </MenuItem>
                {user?.isPlatformAdmin && (
                  <MenuItem href="/admin" onClick={close}>
                    <Icon.shield width={15} height={15} /> Admin panel
                  </MenuItem>
                )}
                <div className="divider my-1" />
                <MenuItem
                  danger
                  onClick={() => {
                    close();
                    void logout();
                  }}
                >
                  <Icon.logout width={15} height={15} /> Sign out
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </aside>

      {/* ── main column ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-header sticky top-0 z-40 flex items-center gap-1.5 border-b bg-[var(--surface)] sm:px-4">
          <button type="button" className="btn btn-ghost btn-icon lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open workspace menu" aria-expanded={drawerOpen}>
            <Icon.menu />
          </button>

          <Link href={`/w/${workspaceId}`} className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 lg:hidden" aria-label="Dashboard">
            <Logo size="sm" />
          </Link>

          {/* Search claims the free space, so on a phone it sits hard against
              the icons on the right rather than floating mid-header. On desktop
              it becomes the wide field at the start of the row instead. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-2.5 text-[13px] text-[var(--text-faint)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-muted)] lg:ml-0 lg:mr-auto lg:h-9 lg:w-72 lg:justify-start"
            aria-label="Search"
          >
            <Icon.search width={16} height={16} />
            <span className="hidden lg:inline">Search tasks, docs, people…</span>
            <kbd className="kbd ml-auto hidden lg:inline-flex">⌘K</kbd>
          </button>

          <div className="flex items-center gap-0.5">
            <span
              className={cx('mr-1 hidden h-1.5 w-1.5 rounded-full sm:block', connected ? 'bg-[var(--success)]' : 'bg-[var(--text-faint)]')}
              title={connected ? 'Live updates connected' : 'Reconnecting…'}
            />
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            <NotificationBell workspaceId={workspaceId} />
          </div>
        </header>

        <main id="main" className="app-main min-w-0 flex-1">
          {children}
        </main>
      </div>

      {/* ── mobile bottom bar: this role's four places, plus its one action ── */}
      <nav className="bottom-bar flex lg:hidden" aria-label="Primary">
        {barItems.map((item) => {
          const count = badgeFor(item);
          const ItemIcon = Icon[item.icon];
          const active = isActive(item);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cx('bottom-bar-item', active && 'bottom-bar-item-active')}
            >
              <span className="bottom-bar-glyph relative">
                <ItemIcon width={21} height={21} />
                {count > 0 && <span className="absolute right-2.5 top-1 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />}
              </span>
              <span className="truncate">{item.short}</span>
            </Link>
          );
        })}

        {hasQuickActions && (
          <button type="button" onClick={() => setCreateOpen(true)} className="bottom-bar-item" aria-label="Create">
            <span className="bottom-bar-glyph bg-[var(--ink)] text-[var(--ink-text)]">
              <Icon.plus width={18} height={18} />
            </span>
            <span className="truncate">Create</span>
          </button>
        )}
      </nav>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        workspaceId={workspaceId}
        items={drawerItems}
        badgeFor={badgeFor}
        isActive={isActive}
      />

      <QuickCreate open={createOpen} onClose={() => setCreateOpen(false)} workspaceId={workspaceId} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <span className="sr-only" aria-live="polite">
        {workspace ? `${workspace.name} workspace` : ''}
      </span>
    </div>
  );
}

export function ShellLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-subtle)]">
      <Spinner size={24} />
    </div>
  );
}
