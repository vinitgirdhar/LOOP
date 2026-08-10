'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDebounced, useQuery } from '@/lib/hooks';
import { Page, PageHeader, StatTile } from '@/components/page';
import { Avatar, Badge, Button, Card, EmptyState, SectionTitle, Skeleton, Tabs } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { Logo } from '@/components/marketing';
import { ThemeToggle } from '@/components/providers/theme';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatBytes, formatDateTime, relativeTime } from '@/lib/format';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'orgs', label: 'Organisations' },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'projects', label: 'Projects' },
  { key: 'roles', label: 'Roles' },
  { key: 'flags', label: 'Feature flags' },
  { key: 'audit', label: 'Audit log' },
];

export default function AdminPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login?next=/admin');
    else if (!user.isPlatformAdmin) router.replace('/app');
  }, [ready, user, router]);

  if (!ready || !user?.isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Skeleton className="h-32 w-64" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-subtle)]">
      <header className="flex items-center justify-between border-b bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link href="/app">
            <Logo />
          </Link>
          <Badge tone="accent">Platform admin</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/app" className="btn btn-secondary btn-sm">
            Back to app
          </Link>
        </div>
      </header>

      <Page>
        <PageHeader title="Admin panel" subtitle="Everything across every organisation on this deployment" />
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users' && <UsersTab currentUserId={user.id} />}
          {tab === 'orgs' && <OrgsTab />}
          {tab === 'workspaces' && <WorkspacesTab />}
          {tab === 'projects' && <ProjectsTab />}
          {tab === 'roles' && <RolesTab />}
          {tab === 'flags' && <FlagsTab />}
          {tab === 'audit' && <AuditTab />}
        </div>
      </Page>
    </div>
  );
}

function OverviewTab() {
  const { data, loading } = useQuery<{
    users: number;
    organizations: number;
    workspaces: number;
    projects: number;
    tasks: number;
    activeSessions: number;
    files: { count: number; bytes: number };
    suggestions: Record<string, number>;
    signups: { day: string; count: number }[];
  }>('/api/admin/stats', []);

  if (loading && !data) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Users" value={data.users} hint={`${data.activeSessions} active sessions`} />
        <StatTile label="Organisations" value={data.organizations} hint={`${data.workspaces} workspaces`} />
        <StatTile label="Projects" value={data.projects} hint={`${data.tasks} tasks`} />
        <StatTile label="Storage" value={formatBytes(data.files.bytes)} hint={`${data.files.count} files`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Signups" subtitle="Last 30 days" />
          {data.signups.length === 0 ? <EmptyState title="No signups in this window" /> : <BarChart data={data.signups.map((row) => ({ label: row.day.slice(5), value: row.count }))} />}
        </Card>
        <Card>
          <SectionTitle title="Auto-Pilot suggestions" subtitle="Across every workspace" />
          <ul className="space-y-2">
            {Object.entries(data.suggestions).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--text-muted)]">{status.replace('_', ' ').toLowerCase()}</span>
                <span className="font-semibold tabular-nums">{count}</span>
              </li>
            ))}
            {Object.keys(data.suggestions).length === 0 && <p className="text-[13px] text-[var(--text-muted)]">None yet.</p>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const { data, loading, refetch, meta } = useQuery<
    { id: string; email: string; name: string; avatarUrl: string | null; emailVerifiedAt: string | null; isPlatformAdmin: boolean; isSuspended: boolean; twoFactorOn: boolean; createdAt: string; _count: { memberships: number; sessions: number } }[]
  >(`/api/admin/users?limit=50${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`, [debounced]);

  const update = async (id: string, patch: Record<string, boolean>) => {
    try {
      await api.patch(`/api/admin/users/${id}`, patch);
      toast.success('User updated');
      void refetch();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    }
  };

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <SectionTitle title="Users" subtitle={meta ? `${meta.total} accounts` : undefined} />
        <input className="input ml-auto w-auto" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading && !data ? (
        <Skeleton className="m-4 h-48" />
      ) : (
        <ul className="divide-y">
          {(data ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar seed={row.id} name={row.name} src={row.avatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {row.name}
                  {row.isPlatformAdmin && <Badge tone="accent" className="ml-1.5">admin</Badge>}
                  {row.isSuspended && <Badge tone="danger" className="ml-1.5">suspended</Badge>}
                  {!row.emailVerifiedAt && <Badge tone="warning" className="ml-1.5">unverified</Badge>}
                </p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {row.email} · {row._count.memberships} workspaces · {row._count.sessions} sessions · joined {relativeTime(row.createdAt)}
                </p>
              </div>
              {row.id !== currentUserId && (
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => void update(row.id, { isSuspended: !row.isSuspended })}>
                    {row.isSuspended ? 'Restore' : 'Suspend'}
                  </Button>
                  <Button size="sm" onClick={() => void update(row.id, { isPlatformAdmin: !row.isPlatformAdmin })}>
                    {row.isPlatformAdmin ? 'Revoke admin' : 'Make admin'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OrgsTab() {
  const toast = useToast();
  const { data, loading, refetch } = useQuery<
    { id: string; name: string; owner: { name: string; email: string }; plan: { key: string; name: string } | null; workspaces: { id: string; name: string; _count: { members: number; projects: number } }[] }[]
  >('/api/admin/organizations', []);
  const { data: plans } = useQuery<{ key: string; name: string; priceMonthly: number; seats: number }[]>('/api/admin/billing-plans', []);

  if (loading && !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      {(data ?? []).map((org) => (
        <Card key={org.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{org.name}</h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Owner {org.owner.name} · {org.owner.email}
              </p>
            </div>
            <select
              className="select w-auto text-xs"
              value={org.plan?.key ?? ''}
              onChange={async (event) => {
                try {
                  await api.patch(`/api/admin/organizations/${org.id}/plan`, { planKey: event.target.value });
                  toast.success('Plan updated');
                  void refetch();
                } catch (caught: unknown) {
                  toast.error(apiErrorMessage(caught));
                }
              }}
            >
              <option value="">No plan</option>
              {(plans ?? []).map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name} · ${plan.priceMonthly}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-3 space-y-1">
            {org.workspaces.map((workspace) => (
              <li key={workspace.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]">
                <Icon.board width={14} height={14} className="text-[var(--text-muted)]" />
                <span className="flex-1 truncate">{workspace.name}</span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {workspace._count.members} members · {workspace._count.projects} projects
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function WorkspacesTab() {
  const { data, loading } = useQuery<{ id: string; name: string; createdAt: string; organization: { name: string }; _count: { members: number; projects: number; tasks: number } }[]>(
    '/api/admin/workspaces',
    [],
  );
  if (loading && !data) return <Skeleton className="h-64 w-full" />;

  return (
    <Card padded={false}>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[38rem] text-left text-[13px]">
          <thead className="border-b bg-[var(--bg-subtle)] text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
            <tr>
              <th className="px-4 py-2 font-medium">Workspace</th>
              <th className="px-4 py-2 font-medium">Organisation</th>
              <th className="px-4 py-2 text-right font-medium">Members</th>
              <th className="px-4 py-2 text-right font-medium">Projects</th>
              <th className="px-4 py-2 text-right font-medium">Tasks</th>
              <th className="px-4 py-2 text-right font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data ?? []).map((workspace) => (
              <tr key={workspace.id}>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/w/${workspace.id}`} className="hover:underline">
                    {workspace.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-[var(--text-muted)]">{workspace.organization.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{workspace._count.members}</td>
                <td className="px-4 py-2 text-right tabular-nums">{workspace._count.projects}</td>
                <td className="px-4 py-2 text-right tabular-nums">{workspace._count.tasks}</td>
                <td className="px-4 py-2 text-right text-[11px] text-[var(--text-muted)]">{relativeTime(workspace.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProjectsTab() {
  const { data, loading } = useQuery<{ id: string; key: string; name: string; status: string; workspace: { id: string; name: string }; _count: { tasks: number; members: number } }[]>(
    '/api/admin/projects',
    [],
  );
  if (loading && !data) return <Skeleton className="h-64 w-full" />;

  return (
    <Card padded={false}>
      <ul className="divide-y">
        {(data ?? []).map((project) => (
          <li key={project.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="font-mono text-[11px] text-[var(--text-faint)]">{project.key}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{project.name}</span>
            <span className="text-[11px] text-[var(--text-muted)]">{project.workspace.name}</span>
            <Badge tone="neutral">{project.status.toLowerCase()}</Badge>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{project._count.tasks} tasks</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RolesTab() {
  const { data, loading } = useQuery<{ key: string; name: string; description: string; rank: number; permissions: { key: string; description: string }[] }[]>('/api/admin/roles', []);
  if (loading && !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {(data ?? []).map((role) => (
        <Card key={role.key}>
          <SectionTitle title={role.name} subtitle={`rank ${role.rank} · ${role.permissions.length} permissions`} />
          <ul className="space-y-1">
            {role.permissions.map((permission) => (
              <li key={permission.key} className="flex gap-2 text-[12px]">
                <span className="shrink-0 font-mono text-[10px] text-[var(--accent)]">{permission.key}</span>
                <span className="text-[var(--text-muted)]">{permission.description}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function FlagsTab() {
  const toast = useToast();
  const { data, loading, refetch } = useQuery<{ id: string; key: string; description: string; enabled: boolean; rollout: number; updatedAt: string }[]>('/api/admin/feature-flags', []);
  if (loading && !data) return <Skeleton className="h-48 w-full" />;

  return (
    <Card padded={false}>
      <div className="border-b px-4 py-3">
        <SectionTitle title="Feature flags" subtitle="Toggle capability per deployment" />
      </div>
      <ul className="divide-y">
        {(data ?? []).map((flag) => (
          <li key={flag.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[13px] font-medium">{flag.key}</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {flag.description} · updated {relativeTime(flag.updatedAt)}
              </p>
            </div>
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={flag.rollout}
              className="w-16 rounded-md border bg-transparent px-1.5 py-1 text-[11px]"
              title="Rollout percentage"
              onBlur={async (event) => {
                const value = Number(event.target.value);
                if (value !== flag.rollout) {
                  await api.patch(`/api/admin/feature-flags/${flag.key}`, { rollout: value });
                  void refetch();
                }
              }}
            />
            <Button
              size="sm"
              variant={flag.enabled ? 'primary' : 'secondary'}
              onClick={async () => {
                try {
                  await api.patch(`/api/admin/feature-flags/${flag.key}`, { enabled: !flag.enabled });
                  toast.success(`${flag.key} ${flag.enabled ? 'disabled' : 'enabled'}`);
                  void refetch();
                } catch (caught: unknown) {
                  toast.error(apiErrorMessage(caught));
                }
              }}
            >
              {flag.enabled ? 'On' : 'Off'}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AuditTab() {
  const [filter, setFilter] = useState('');
  const debounced = useDebounced(filter, 300);
  const { data, loading, meta } = useQuery<
    { id: string; action: string; entity: string; createdAt: string; ip: string | null; actor: { name: string; email: string } | null; workspace: { name: string } | null; meta: Record<string, unknown> }[]
  >(`/api/admin/audit-logs?limit=60${debounced ? `&action=${encodeURIComponent(debounced)}` : ''}`, [debounced]);

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <SectionTitle title="Platform audit log" subtitle={meta ? `${meta.total} entries` : undefined} />
        <input className="input ml-auto w-auto" placeholder="Filter by action…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {loading && !data ? (
        <Skeleton className="m-4 h-48" />
      ) : (
        <ul className="divide-y">
          {(data ?? []).map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]">
              <span className="badge bg-[var(--bg-inset)] font-mono text-[10px] text-[var(--text-muted)]">{entry.action}</span>
              <span>{entry.actor?.name ?? 'system'}</span>
              {entry.workspace && <span className="text-[11px] text-[var(--text-muted)]">in {entry.workspace.name}</span>}
              <span className="ml-auto text-[11px] text-[var(--text-faint)]">
                {entry.ip ?? '—'} · {formatDateTime(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
