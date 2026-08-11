'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@loop/shared';
import { useQuery } from '@/lib/hooks';
import { Avatar, Badge, Button, Card, Field, Modal, SectionTitle, Skeleton, Tabs } from '@/components/ui';
import { Logo } from '@/components/marketing';
import { ThemeToggle } from '@/components/providers/theme';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const { user, memberships, ready, logout, reloadMemberships } = useAuth();
  const [tab, setTab] = useState('profile');

  useEffect(() => {
    if (ready && !user) router.replace('/login?next=/profile');
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Skeleton className="h-32 w-64" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-subtle)]">
      <header className="flex items-center justify-between border-b bg-[var(--surface)] px-4 py-3 sm:px-6">
        <Link href="/app">
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button size="sm" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-center gap-4">
          <Avatar seed={user.id} name={user.name} src={user.avatarUrl} size={56} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-[-0.02em]">{user.name}</h1>
            <p className="truncate text-[13px] text-[var(--text-muted)]">{user.email}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {user.isPlatformAdmin && <Badge tone="accent">Platform admin</Badge>}
              {user.emailVerifiedAt ? <Badge tone="success">Email verified</Badge> : <Badge tone="warning">Email not verified</Badge>}
            </div>
          </div>
        </div>

        <Tabs
          tabs={[
            { key: 'profile', label: 'Profile' },
            { key: 'security', label: 'Security' },
            { key: 'sessions', label: 'Devices' },
            { key: 'workspaces', label: 'Workspaces' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div className="mt-4 space-y-4">
          {tab === 'profile' && <ProfileTab onSaved={reloadMemberships} />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'sessions' && <SessionsTab onLogoutAll={logout} />}
          {tab === 'workspaces' && (
            <Card padded={false}>
              <div className="border-b px-4 py-3">
                <SectionTitle title="Your workspaces" />
              </div>
              <ul className="divide-y">
                {memberships.map((membership) => (
                  <li key={membership.id}>
                    <Link href={`/w/${membership.workspace.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-inset)]">
                      <Avatar name={membership.workspace.name} src={membership.workspace.logoUrl} size={30} kind="workspace" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{membership.workspace.name}</span>
                        <span className="block text-[11px] text-[var(--text-muted)]">{ROLE_LABELS[membership.role]}</span>
                      </span>
                      <Icon.chevronRight width={15} height={15} className="text-[var(--text-faint)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="danger" onClick={() => void logout()} icon={<Icon.logout width={15} height={15} />}>
            Sign out
          </Button>
        </div>
      </main>
    </div>
  );
}

function ProfileTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [saving, setSaving] = useState(false);

  return (
    <Card>
      <SectionTitle title="Your details" />
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Avatar URL" hint="Leave blank to use your initials.">
          <input className="input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Timezone">
          <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/London" />
        </Field>
        <Button
          variant="primary"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api.patch('/api/auth/me', { name, avatarUrl: avatarUrl || null, timezone });
              await onSaved();
              toast.success('Profile updated');
            } catch (caught: unknown) {
              toast.error(apiErrorMessage(caught));
            } finally {
              setSaving(false);
            }
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function SecurityTab() {
  const { user, memberships } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [twoFactorOn, setTwoFactorOn] = useState(false);

  const canUse2fa = user?.isPlatformAdmin || memberships.some((m) => m.role === 'OWNER');

  // Asked for here rather than in the auth provider: only this panel needs it,
  // and there it sat in front of the first paint of every page.
  useEffect(() => {
    if (!canUse2fa) return;
    let cancelled = false;
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      if (!cancelled) setTwoFactorOn((data?.totp ?? []).some((factor) => factor.status === 'verified'));
    });
    return () => {
      cancelled = true;
    };
  }, [canUse2fa]);

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle title="Password" subtitle="Changing it signs out every other device" />
        <div className="space-y-3">
          <Field label="Current password">
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 8 characters with upper case, lower case and a number.">
            <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button
            variant="primary"
            loading={saving}
            disabled={!current || next.length < 8}
            onClick={async () => {
              setSaving(true);
              try {
                await api.post('/api/auth/change-password', { currentPassword: current, password: next });
                setCurrent('');
                setNext('');
                toast.success('Password changed');
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setSaving(false);
              }
            }}
          >
            Change password
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Two-factor authentication" subtitle="Available to workspace owners and platform admins" />
        {!canUse2fa ? (
          <p className="text-[13px] text-[var(--text-muted)]">Your role does not have two-factor available.</p>
        ) : twoFactorOn ? (
          <div className="space-y-3">
            <Badge tone="success">Two-factor is on</Badge>
            <Field label="Enter a code to turn it off">
              <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Button
              variant="danger"
              disabled={code.length !== 6}
              onClick={async () => {
                try {
                  await api.post('/api/auth/2fa/disable', { code });
                  toast.success('Two-factor disabled — sign in again to refresh');
                  setCode('');
                } catch (caught: unknown) {
                  toast.error(apiErrorMessage(caught));
                }
              }}
            >
              Disable
            </Button>
          </div>
        ) : (
          <Button
            onClick={async () => {
              try {
                const { data } = await api.post<{ secret: string; qrDataUrl: string }>('/api/auth/2fa/setup');
                setSetup(data);
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              }
            }}
          >
            Set up two-factor
          </Button>
        )}
      </Card>

      <Modal
        open={Boolean(setup)}
        onClose={() => setSetup(null)}
        title="Set up two-factor"
        footer={
          <>
            <Button onClick={() => setSetup(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={code.length !== 6}
              onClick={async () => {
                try {
                  await api.post('/api/auth/2fa/enable', { code });
                  toast.success('Two-factor enabled');
                  setSetup(null);
                  setCode('');
                } catch (caught: unknown) {
                  toast.error(apiErrorMessage(caught));
                }
              }}
            >
              Enable
            </Button>
          </>
        }
      >
        {setup && (
          <div className="space-y-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="Two-factor QR code" className="mx-auto h-44 w-44 rounded-lg border bg-white p-2" />
            <p className="text-[13px] text-[var(--text-muted)]">Scan with your authenticator app, or enter the key manually:</p>
            <p className="break-all rounded-lg bg-[var(--bg-inset)] px-3 py-2 font-mono text-[12px]">{setup.secret}</p>
            <Field label="Enter the six digit code">
              <input className="input text-center text-lg tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SessionsTab({ onLogoutAll }: { onLogoutAll: () => Promise<void> }) {
  const toast = useToast();
  const { data, loading, refetch } = useQuery<SessionRow[]>('/api/auth/sessions', []);

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <SectionTitle title="Signed-in devices" subtitle="Refresh tokens rotate on every use; reuse revokes everything" />
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            try {
              await api.post('/api/auth/logout-all');
              toast.success('Signed out everywhere');
              await onLogoutAll();
            } catch (caught: unknown) {
              toast.error(apiErrorMessage(caught));
            }
          }}
        >
          Sign out everywhere
        </Button>
      </div>
      {loading && !data ? (
        <Skeleton className="m-4 h-32" />
      ) : (
        <ul className="divide-y">
          {(data ?? []).map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {session.userAgent?.slice(0, 70) ?? 'Unknown device'}
                  {session.current && <Badge tone="success" className="ml-1.5">this device</Badge>}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {session.ip ?? 'unknown ip'} · last used {relativeTime(session.lastUsedAt)} · expires {formatDateTime(session.expiresAt)}
                </p>
              </div>
              {!session.current && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await api.del(`/api/auth/sessions/${session.id}`);
                    toast.success('Session revoked');
                    void refetch();
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
