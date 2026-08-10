'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@loop/shared';
import { useAuth } from '@/components/providers/auth';
import { useTheme } from '@/components/providers/theme';
import { Avatar, CloseIcon } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useLockScroll } from '@/lib/hooks';
import { cx } from '@/lib/format';
import { NAV_GROUP_LABELS, type NavGroup, type NavItem } from './nav-items';

/**
 * The hamburger surface.
 *
 * Deliberately *not* a copy of the bottom bar. The bar carries the four places
 * this role works in; the drawer carries everything the bar cannot — the rest of
 * the workspace, workspace switching, and the account. Anything already sitting
 * in the bar is filtered out on the way in, so no row appears twice on screen.
 */
export function MobileDrawer({
  open,
  onClose,
  workspaceId,
  items,
  badgeFor,
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  items: NavItem[];
  badgeFor: (item: NavItem) => number;
  isActive: (item: NavItem) => boolean;
}) {
  const router = useRouter();
  const { user, role, memberships, selectWorkspace, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [switching, setSwitching] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useLockScroll(open);

  useEffect(() => {
    if (!open) {
      setSwitching(false);
      return;
    }
    restoreTo.current = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panel.current) return;
      // Keep tabbing inside the drawer while it covers the page.
      const focusable = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const workspace = memberships.find((m) => m.workspace.id === workspaceId)?.workspace;
  const groups: NavGroup[] = ['work', 'knowledge', 'insights'];
  const navRows = items.filter((item) => item.group !== 'workspace');
  const settings = items.find((item) => item.group === 'workspace');

  return (
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Workspace menu">
      <button type="button" className="overlay absolute inset-0" onClick={onClose} aria-label="Close menu" tabIndex={-1} />

      <div
        ref={panel}
        className="drawer-in absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)' }}
      >
        {/* Workspace identity + switcher */}
        <div className="flex items-center gap-2.5 border-b px-3 py-3">
          <button
            type="button"
            data-autofocus
            onClick={() => setSwitching((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-[var(--bg-inset)]"
            aria-expanded={switching}
          >
            <Avatar name={workspace?.name ?? 'Workspace'} src={workspace?.logoUrl} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{workspace?.name ?? 'Workspace'}</span>
              <span className="block truncate text-[11px] text-[var(--text-muted)]">{role ? ROLE_LABELS[role] : 'Member'}</span>
            </span>
            <Icon.chevronDown width={15} height={15} className={cx('shrink-0 text-[var(--text-faint)] transition-transform', switching && 'rotate-180')} />
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm shrink-0" aria-label="Close menu">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          {switching ? (
            <div className="p-2">
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Switch workspace</p>
              {memberships.map((membership) => (
                <button
                  key={membership.workspace.id}
                  type="button"
                  onClick={() => {
                    selectWorkspace(membership.workspace.id);
                    router.push(`/w/${membership.workspace.id}`);
                    onClose();
                  }}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-[13px] transition-colors',
                    membership.workspace.id === workspaceId ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'hover:bg-[var(--bg-inset)]',
                  )}
                >
                  <Avatar name={membership.workspace.name} src={membership.workspace.logoUrl} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{membership.workspace.name}</span>
                    <span className="block text-[11px] text-[var(--text-muted)]">{ROLE_LABELS[membership.role]}</span>
                  </span>
                  {membership.workspace.id === workspaceId && <Icon.check width={14} height={14} className="shrink-0" />}
                </button>
              ))}
              <Link href="/app?new=1" onClick={onClose} className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-[13px] text-[var(--text-muted)] hover:bg-[var(--bg-inset)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed">
                  <Icon.plus width={13} height={13} />
                </span>
                New workspace
              </Link>
            </div>
          ) : (
            <>
              {navRows.length > 0 && (
                <div className="px-2 pt-2">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">More in this workspace</p>
                  {groups.map((group) => {
                    const rows = navRows.filter((item) => item.group === group);
                    if (rows.length === 0) return null;
                    return (
                      <div key={group} className="mb-1.5">
                        <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-[var(--text-faint)]">{NAV_GROUP_LABELS[group]}</p>
                        {rows.map((item) => {
                          const count = badgeFor(item);
                          const ItemIcon = Icon[item.icon];
                          return (
                            <Link
                              key={item.id}
                              href={item.href}
                              onClick={onClose}
                              aria-current={isActive(item) ? 'page' : undefined}
                              className={cx(
                                'flex items-center gap-3 rounded-lg px-2 py-2.5 text-[13px] transition-colors',
                                isActive(item) ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text)] hover:bg-[var(--bg-inset)]',
                              )}
                            >
                              <ItemIcon width={17} height={17} className="shrink-0 text-[var(--text-muted)]" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{item.label}</span>
                                {item.hint && <span className="block truncate text-[11px] font-normal text-[var(--text-muted)]">{item.hint}</span>}
                              </span>
                              {count > 0 && <span className="badge-count">{count > 99 ? '99+' : count}</span>}
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="divider mx-3 my-1.5" />

              {/* Account and workspace administration — the drawer's own job. */}
              <div className="px-2 pb-2">
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Account</p>

                <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <Avatar name={user?.name ?? '?'} src={user?.avatarUrl} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{user?.name}</span>
                    <span className="block truncate text-[11px] text-[var(--text-muted)]">{user?.email}</span>
                  </span>
                </div>

                {settings && (
                  <Link href={settings.href} onClick={onClose} className="drawer-row">
                    <Icon.settings width={17} height={17} className="text-[var(--text-muted)]" /> Workspace settings
                  </Link>
                )}
                <Link href="/profile" onClick={onClose} className="drawer-row">
                  <Icon.user width={17} height={17} className="text-[var(--text-muted)]" /> Profile and security
                </Link>
                <Link href="/app" onClick={onClose} className="drawer-row">
                  <Icon.board width={17} height={17} className="text-[var(--text-muted)]" /> All workspaces
                </Link>
                {user?.isPlatformAdmin && (
                  <Link href="/admin" onClick={onClose} className="drawer-row">
                    <Icon.shield width={17} height={17} className="text-[var(--text-muted)]" /> Admin panel
                  </Link>
                )}

                <button type="button" onClick={toggle} className="drawer-row w-full">
                  <Icon.contrast width={17} height={17} className="text-[var(--text-muted)]" />
                  <span className="flex-1 text-left">Appearance</span>
                  <span className="text-[11px] capitalize text-[var(--text-muted)]">{theme}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    void logout();
                  }}
                  className="drawer-row w-full text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  <Icon.logout width={17} height={17} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
