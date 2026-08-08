'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, ROLE_LABELS, type Role } from '@loop/shared';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Avatar, Badge, Button, Card, Confirm, CopyButton, EmptyState, Field, Modal, SectionTitle, Skeleton, Tabs } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';

interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  role: Role;
  organization: { id: string; name: string; plan: { key: string; name: string; seats: number; priceMonthly: number } | null };
  departments: { id: string; name: string; description: string | null }[];
  _count: { members: number; projects: number };
}

interface MemberRow {
  id: string;
  role: Role;
  title: string | null;
  capacityHrs: number;
  joinedAt: string;
  online: boolean;
  department: { id: string; name: string } | null;
  user: { id: string; name: string; email: string; avatarUrl: string | null; lastSeenAt: string | null };
}

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'members', label: 'Members' },
  { key: 'departments', label: 'Departments' },
  { key: 'roles', label: 'Roles' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'billing', label: 'Billing' },
  { key: 'audit', label: 'Audit log' },
];

export default function SettingsPage({ params }: { params: Promise<{ workspaceId: string; section?: string[] }> }) {
  const { workspaceId, section } = use(params);
  const router = useRouter();
  const { can, reloadMemberships } = useAuth();
  const [tab, setTab] = useState(section?.[0] ?? 'general');

  const { data: workspace, loading, refetch } = useQuery<WorkspaceDetail>(`/api/workspaces/${workspaceId}`, [workspaceId]);

  if (loading && !workspace) {
    return (
      <Page>
        <Skeleton className="mb-4 h-14 w-full" />
        <Skeleton className="h-80 w-full" />
      </Page>
    );
  }
  if (!workspace) return null;

  return (
    <Page className="max-w-5xl">
      <PageHeader title="Workspace settings" subtitle={`${workspace.name} · ${workspace._count.members} members · ${workspace._count.projects} projects`} />

      <Tabs
        tabs={TABS.filter((entry) => (entry.key === 'audit' ? can('workspace.audit.view') : entry.key === 'billing' ? can('workspace.billing.view') : true))}
        active={tab}
        onChange={(key) => {
          setTab(key);
          router.replace(`/w/${workspaceId}/settings/${key === 'general' ? '' : key}`);
        }}
      />

      <div className="mt-4">
        {tab === 'general' && <GeneralTab workspace={workspace} onChanged={() => { void refetch(); void reloadMemberships(); }} />}
        {tab === 'members' && <MembersTab workspaceId={workspaceId} />}
        {tab === 'departments' && <DepartmentsTab workspace={workspace} onChanged={refetch} />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'integrations' && <IntegrationsTab workspaceId={workspaceId} />}
        {tab === 'billing' && <BillingTab workspace={workspace} />}
        {tab === 'audit' && <AuditTab workspaceId={workspaceId} />}
      </div>
    </Page>
  );
}

function GeneralTab({ workspace, onChanged }: { workspace: WorkspaceDetail; onChanged: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const readOnly = !can('workspace.update');

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle title="Identity" />
        <div className="flex items-center gap-4">
          <Avatar name={workspace.name} src={workspace.logoUrl} size={56} />
          {can('workspace.update') && (
            <label className="btn btn-secondary btn-sm cursor-pointer">
              Change logo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  if (!event.target.files?.[0]) return;
                  const form = new FormData();
                  form.append('file', event.target.files[0]);
                  try {
                    await api.upload(`/api/workspaces/${workspace.id}/logo`, form);
                    toast.success('Logo updated');
                    onChanged();
                  } catch (caught: unknown) {
                    toast.error(apiErrorMessage(caught));
                  }
                }}
              />
            </label>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Workspace name">
            <input className="input" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <textarea className="textarea min-h-20" value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Workspace id" hint="Used by the API as the x-workspace-id header.">
            <div className="flex gap-2">
              <input className="input font-mono text-[12px]" value={workspace.id} readOnly />
              <CopyButton value={workspace.id} />
            </div>
          </Field>
          {!readOnly && (
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await api.patch(`/api/workspaces/${workspace.id}`, { name, description: description || null });
                  toast.success('Workspace updated');
                  onChanged();
                } catch (caught: unknown) {
                  toast.error(apiErrorMessage(caught));
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
          )}
        </div>
      </Card>

      {can('workspace.delete') && (
        <Card className="border-[var(--danger)]/30">
          <SectionTitle title="Danger zone" subtitle="Deleting removes every project, task, document and message" />
          <Button variant="danger" onClick={() => setDeleting(true)}>
            Delete workspace
          </Button>
        </Card>
      )}

      <Confirm
        open={deleting}
        title="Delete workspace"
        message={`"${workspace.name}" and everything inside it will be permanently removed. This cannot be undone.`}
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          try {
            await api.del(`/api/workspaces/${workspace.id}`);
            toast.success('Workspace deleted');
            router.push('/app');
          } catch (caught: unknown) {
            toast.error(apiErrorMessage(caught));
          }
        }}
      />
    </div>
  );
}

function MembersTab({ workspaceId }: { workspaceId: string }) {
  const { can, user } = useAuth();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  const { data: members, loading, refetch } = useQuery<MemberRow[]>(`/api/workspaces/${workspaceId}/members`, [workspaceId]);
  const { data: invites, refetch: refetchInvites } = useQuery<{ id: string; email: string; role: Role; link: string; expiresAt: string; invitedBy: { name: string } }[]>(
    can('workspace.invite') ? `/api/workspaces/${workspaceId}/invites` : null,
    [workspaceId],
  );
  const { data: workspace } = useQuery<WorkspaceDetail>(`/api/workspaces/${workspaceId}`, [workspaceId]);

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <SectionTitle title="Members" subtitle={`${members?.length ?? 0} people`} />
          {can('workspace.invite') && (
            <Button size="sm" variant="primary" icon={<Icon.plus width={14} height={14} />} onClick={() => setInviting(true)}>
              Invite
            </Button>
          )}
        </div>
        {loading && !members ? (
          <Skeleton className="m-4 h-40" />
        ) : (
          <ul className="divide-y">
            {(members ?? []).map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="relative">
                  <Avatar name={member.user.name} src={member.user.avatarUrl} size={34} />
                  {member.online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--success)] ring-2 ring-[var(--surface)]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {member.user.name}
                    {member.user.id === user?.id && <span className="ml-1.5 text-[11px] text-[var(--text-faint)]">you</span>}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">
                    {member.user.email}
                    {member.title ? ` · ${member.title}` : ''}
                    {member.department ? ` · ${member.department.name}` : ''}
                  </p>
                </div>

                {can('workspace.member.manage') ? (
                  <>
                    <select
                      className="select w-auto text-xs"
                      value={member.role}
                      onChange={async (event) => {
                        try {
                          await api.patch(`/api/workspaces/${workspaceId}/members/${member.id}`, { role: event.target.value });
                          toast.success(`${member.user.name} is now ${ROLE_LABELS[event.target.value as Role]}`);
                          void refetch();
                        } catch (caught: unknown) {
                          toast.error(apiErrorMessage(caught));
                        }
                      }}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select w-auto text-xs"
                      value={member.department?.id ?? ''}
                      onChange={async (event) => {
                        await api.patch(`/api/workspaces/${workspaceId}/members/${member.id}`, { departmentId: event.target.value || null });
                        void refetch();
                      }}
                    >
                      <option value="">No department</option>
                      {(workspace?.departments ?? []).map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={80}
                      className="w-16 rounded-md border bg-transparent px-1.5 py-1 text-[11px]"
                      title="Weekly capacity in hours"
                      defaultValue={member.capacityHrs}
                      onBlur={async (event) => {
                        const value = Number(event.target.value);
                        if (value !== member.capacityHrs) {
                          await api.patch(`/api/workspaces/${workspaceId}/members/${member.id}`, { capacityHrs: value });
                          void refetch();
                        }
                      }}
                    />
                    <button type="button" onClick={() => setRemoving(member)} className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]" aria-label={`Remove ${member.user.name}`}>
                      <Icon.trash width={14} height={14} />
                    </button>
                  </>
                ) : (
                  <Badge tone="neutral">{ROLE_LABELS[member.role]}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {can('workspace.invite') && invites && invites.length > 0 && (
        <Card padded={false}>
          <div className="border-b px-4 py-3">
            <SectionTitle title="Pending invites" />
          </div>
          <ul className="divide-y">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{invite.email}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {ROLE_LABELS[invite.role]} · invited by {invite.invitedBy.name} · expires {relativeTime(invite.expiresAt)}
                  </p>
                </div>
                <CopyButton value={invite.link} label="Copy link" />
                <button
                  type="button"
                  onClick={async () => {
                    await api.del(`/api/workspaces/${workspaceId}/invites/${invite.id}`);
                    void refetchInvites();
                  }}
                  className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]"
                  aria-label="Revoke invite"
                >
                  <Icon.trash width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <InviteModal workspaceId={workspaceId} open={inviting} onClose={() => setInviting(false)} onSent={() => { setInviting(false); void refetchInvites(); }} />

      <Confirm
        open={Boolean(removing)}
        title="Remove member"
        message={`${removing?.user.name} will lose access to this workspace immediately.`}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api.del(`/api/workspaces/${workspaceId}/members/${removing.id}`);
            toast.success('Member removed');
            setRemoving(null);
            void refetch();
          } catch (caught: unknown) {
            toast.error(apiErrorMessage(caught));
          }
        }}
      />
    </div>
  );
}

function InviteModal({ workspaceId, open, onClose, onSent }: { workspaceId: string; open: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  return (
    <Modal
      open={open}
      onClose={() => {
        setLink(null);
        onClose();
      }}
      title="Invite someone"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!email.includes('@')}
            onClick={async () => {
              setLoading(true);
              try {
                const { data } = await api.post<{ link: string }>(`/api/workspaces/${workspaceId}/invites`, { email: email.trim().toLowerCase(), role });
                setLink(data.link);
                setEmail('');
                toast.success('Invite sent');
                onSent();
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Send invite
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Email" required>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" autoFocus />
        </Field>
        <Field label="Role" hint="Clients only see progress, shared docs and can comment or approve.">
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>
        {link && (
          <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] p-3">
            <p className="text-[13px] font-medium text-[var(--success)]">Invite created</p>
            <p className="mt-1 break-all text-[11px] text-[var(--text-muted)]">{link}</p>
            <div className="mt-2">
              <CopyButton value={link} label="Copy invite link" />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DepartmentsTab({ workspace, onChanged }: { workspace: WorkspaceDetail; onChanged: () => void }) {
  const { can } = useAuth();
  const [name, setName] = useState('');
  const readOnly = !can('workspace.department.manage');

  return (
    <Card>
      <SectionTitle title="Departments" subtitle="Group members for workload and reporting" />
      {workspace.departments.length === 0 ? (
        <EmptyState title="No departments" description="Add Engineering, Design, Quality — whatever fits." />
      ) : (
        <ul className="space-y-1.5">
          {workspace.departments.map((department) => (
            <li key={department.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Icon.users width={15} height={15} className="text-[var(--text-muted)]" />
              <span className="flex-1 text-[13px]">{department.name}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]"
                  aria-label={`Delete ${department.name}`}
                  onClick={async () => {
                    await api.del(`/api/workspaces/${workspace.id}/departments/${department.id}`);
                    onChanged();
                  }}
                >
                  <Icon.trash width={13} height={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) return;
            await api.post(`/api/workspaces/${workspace.id}/departments`, { name: name.trim() });
            setName('');
            onChanged();
          }}
        >
          <input className="input" placeholder="New department" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>
            Add
          </Button>
        </form>
      )}
    </Card>
  );
}

function RolesTab() {
  const { data, loading } = useQuery<{ key: Role; name: string; description: string; permissions: string[] }[]>('/api/integrations/roles', []);

  if (loading && !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-3">
      <Card className="border-[var(--accent)]/30 bg-[var(--accent-soft)]/40">
        <p className="text-[13px] leading-relaxed">
          This matrix is stored in the database and enforced by a single middleware layer on the API. The interface only hides what the server would refuse
          anyway — changing the UI cannot grant access.
        </p>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        {(data ?? []).map((role) => (
          <Card key={role.key}>
            <SectionTitle title={role.name} subtitle={`${role.permissions.length} permissions`} />
            <div className="flex flex-wrap gap-1">
              {role.permissions.map((permission) => (
                <span key={permission} className="badge bg-[var(--bg-inset)] font-mono text-[10px] text-[var(--text-muted)]">
                  {permission}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function IntegrationsTab({ workspaceId }: { workspaceId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const [repo, setRepo] = useState('');
  const { data, loading, refetch } = useQuery<{ id: string; provider: string; config: Record<string, string>; enabled: boolean }[]>('/api/integrations', [workspaceId]);

  const github = data?.find((row) => row.provider === 'github');

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle title="GitHub" subtitle="Feeds the Auto-Pilot board with commits and pull requests" />
        {loading && !data ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            {github && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border p-3">
                <Icon.github width={17} height={17} />
                <span className="flex-1 font-mono text-[13px]">{github.config.repo}</span>
                <Badge tone={github.enabled ? 'success' : 'neutral'}>{github.enabled ? 'connected' : 'disabled'}</Badge>
                {can('workspace.integration.manage') && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]"
                    aria-label="Disconnect"
                    onClick={async () => {
                      await api.del(`/api/integrations/${github.id}`);
                      void refetch();
                    }}
                  >
                    <Icon.trash width={14} height={14} />
                  </button>
                )}
              </div>
            )}
            {can('workspace.integration.manage') && (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!repo.includes('/')) return;
                  try {
                    await api.post('/api/integrations', { provider: 'github', config: { repo: repo.trim() } });
                    toast.success('Repository connected');
                    setRepo('');
                    void refetch();
                  } catch (caught: unknown) {
                    toast.error(apiErrorMessage(caught));
                  }
                }}
              >
                <input className="input flex-1 font-mono text-[13px]" placeholder="owner/repository" value={repo} onChange={(e) => setRepo(e.target.value)} />
                <Button type="submit" variant="primary" disabled={!repo.includes('/')}>
                  Connect
                </Button>
              </form>
            )}
            <div className="mt-3 rounded-lg bg-[var(--bg-inset)] p-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text)]">Webhook setup</p>
              <p className="mt-1">
                In the repository settings add a webhook pointing at{' '}
                <span className="font-mono">{process.env.NEXT_PUBLIC_API_URL}/api/webhooks/github</span>, content type{' '}
                <span className="font-mono">application/json</span>, and set the same secret as <span className="font-mono">GITHUB_WEBHOOK_SECRET</span>. Send
                push, create and pull_request events. Signatures are verified with HMAC SHA-256.
              </p>
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle title="Other providers" subtitle="Planned for v2" />
        <div className="grid gap-2 sm:grid-cols-3">
          {['Google Calendar', 'Google Drive', 'Slack'].map((provider) => (
            <div key={provider} className="flex items-center justify-between rounded-lg border p-3 text-[13px] opacity-60">
              {provider}
              <Badge tone="neutral">soon</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BillingTab({ workspace }: { workspace: WorkspaceDetail }) {
  const plan = workspace.organization.plan;
  return (
    <Card>
      <SectionTitle title="Plan" subtitle="Display only — no payment processing in this build" />
      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
        <div className="flex-1">
          <p className="text-lg font-bold">{plan?.name ?? 'Free'}</p>
          <p className="text-[13px] text-[var(--text-muted)]">
            {plan ? `$${plan.priceMonthly} per user / month · up to ${plan.seats} seats` : 'No plan attached'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{workspace._count.members}</p>
          <p className="text-[11px] text-[var(--text-muted)]">seats used</p>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-[var(--text-muted)]">
        Organisation: {workspace.organization.name}. A platform admin can change the plan from the admin panel.
      </p>
    </Card>
  );
}

function AuditTab({ workspaceId }: { workspaceId: string }) {
  const [filter, setFilter] = useState('');
  const { data, loading, meta } = useQuery<{ id: string; action: string; entity: string; entityId: string | null; meta: Record<string, unknown>; ip: string | null; createdAt: string; actor: { name: string; email: string } | null }[]>(
    `/api/workspaces/${workspaceId}/audit-logs?limit=50${filter ? `&action=${encodeURIComponent(filter)}` : ''}`,
    [workspaceId, filter],
  );

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <SectionTitle title="Audit log" subtitle={meta ? `${meta.total} recorded actions` : 'Every privileged action'} />
        <input className="input ml-auto w-auto" placeholder="Filter by action…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {loading && !data ? (
        <Skeleton className="m-4 h-40" />
      ) : (data ?? []).length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nothing logged yet" />
        </div>
      ) : (
        <ul className="divide-y">
          {(data ?? []).map((entry) => (
            <li key={entry.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge bg-[var(--bg-inset)] font-mono text-[10px] text-[var(--text-muted)]">{entry.action}</span>
                <span className="text-[13px]">{entry.actor?.name ?? 'system'}</span>
                <span className="ml-auto text-[11px] text-[var(--text-faint)]">{formatDateTime(entry.createdAt)}</span>
              </div>
              {Object.keys(entry.meta ?? {}).length > 0 && (
                <pre className="scroll-thin mt-1 overflow-x-auto rounded bg-[var(--bg-inset)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
                  {JSON.stringify(entry.meta)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
