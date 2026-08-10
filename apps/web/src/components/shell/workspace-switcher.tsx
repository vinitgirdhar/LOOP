'use client';

import { useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@loop/shared';
import { useAuth } from '@/components/providers/auth';
import { Avatar, Menu, MenuItem } from '@/components/ui';
import { Icon } from '@/components/icons';

export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { memberships, selectWorkspace } = useAuth();
  const current = memberships.find((m) => m.workspace.id === workspaceId);

  return (
    <Menu
      align="left"
      className="w-full"
      label="Switch workspace"
      trigger={
        <button type="button" className="flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-inset)]">
          <Avatar name={current?.workspace.name ?? 'Workspace'} src={current?.workspace.logoUrl} size={26} kind="workspace" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{current?.workspace.name ?? 'Workspace'}</span>
            <span className="block truncate text-[10px] text-[var(--text-muted)]">{current ? ROLE_LABELS[current.role] : ''}</span>
          </span>
          <Icon.chevronDown width={14} height={14} className="shrink-0 text-[var(--text-faint)]" />
        </button>
      }
    >
      {(close) => (
        <div className="w-56">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Workspaces</p>
          {memberships.map((membership) => (
            <MenuItem
              key={membership.workspace.id}
              onClick={() => {
                close();
                selectWorkspace(membership.workspace.id);
                router.push(`/w/${membership.workspace.id}`);
              }}
            >
              <Avatar name={membership.workspace.name} src={membership.workspace.logoUrl} size={18} kind="workspace" />
              <span className="min-w-0 flex-1 truncate">{membership.workspace.name}</span>
              {membership.workspace.id === workspaceId && <Icon.check width={14} height={14} className="shrink-0 text-[var(--accent)]" />}
            </MenuItem>
          ))}
          <div className="divider my-1" />
          <MenuItem
            onClick={() => {
              close();
              router.push('/app?new=1');
            }}
          >
            <Icon.plus width={15} height={15} /> New workspace
          </MenuItem>
        </div>
      )}
    </Menu>
  );
}
