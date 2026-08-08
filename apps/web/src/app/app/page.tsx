'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROLE_LABELS } from '@loop/shared';
import { useAuth } from '@/components/providers/auth';
import { Avatar, Button, Card, Field, Modal, Spinner } from '@/components/ui';
import { Logo } from '@/components/marketing';
import { ThemeToggle } from '@/components/providers/theme';
import { FormError } from '@/components/auth-form';
import { api, apiErrorMessage } from '@/lib/api';
import { Icon } from '@/components/icons';

function WorkspacePicker() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, memberships, ready, selectWorkspace, reloadMemberships, logout } = useAuth();

  const [creating, setCreating] = useState(params.get('new') === '1');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login?next=/app');
  }, [ready, user, router]);

  useEffect(() => {
    // Straight through when there is exactly one workspace and nothing to pick.
    if (ready && user && memberships.length === 1 && params.get('new') !== '1') {
      const only = memberships[0]!.workspace.id;
      selectWorkspace(only);
      router.replace(`/w/${only}`);
    }
  }, [ready, user, memberships, params, router, selectWorkspace]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={22} />
      </div>
    );
  }

  const unverified = !user.emailVerifiedAt;

  return (
    <div className="min-h-dvh bg-[var(--bg-subtle)]">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 pt-4 sm:px-6">
        <h1 className="text-xl font-bold tracking-[-0.02em]">Hello {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">Pick a workspace, or start a new one.</p>

        {unverified && (
          <Card className="mt-4 border-[var(--warning)]/40 bg-[var(--warning-soft)]">
            <p className="text-[13px] font-semibold text-[var(--warning)]">Verify your email first</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Email verification is required before you can create a workspace. You can still accept invites.
            </p>
            <Link href={`/verify-email?email=${encodeURIComponent(user.email)}`} className="btn btn-secondary btn-sm mt-3">
              Verify now
            </Link>
          </Card>
        )}

        <div className="mt-5 space-y-2">
          {memberships.map((membership) => (
            <button
              key={membership.workspace.id}
              type="button"
              onClick={() => {
                selectWorkspace(membership.workspace.id);
                router.push(`/w/${membership.workspace.id}`);
              }}
              className="card flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-[var(--accent)]"
            >
              <Avatar name={membership.workspace.name} src={membership.workspace.logoUrl} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{membership.workspace.name}</span>
                <span className="block text-xs text-[var(--text-muted)]">{ROLE_LABELS[membership.role]}</span>
              </span>
              <Icon.chevronRight width={16} height={16} className="text-[var(--text-faint)]" />
            </button>
          ))}

          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={unverified}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors hover:border-[var(--accent)] disabled:opacity-50"
          >
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[var(--bg-inset)] text-[var(--text-muted)]">
              <Icon.plus width={18} height={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold">Create a workspace</span>
              <span className="block text-xs text-[var(--text-muted)]">Projects, docs and chat for one team</span>
            </span>
          </button>
        </div>
      </main>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create a workspace"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={name.trim().length < 2}
              onClick={async () => {
                setError(null);
                setLoading(true);
                try {
                  const { data } = await api.post<{ id: string }>('/api/workspaces', {
                    name: name.trim(),
                    ...(orgName.trim() ? { organizationName: orgName.trim() } : {}),
                  });
                  await reloadMemberships();
                  selectWorkspace(data.id);
                  router.push(`/w/${data.id}`);
                } catch (caught: unknown) {
                  setError(apiErrorMessage(caught));
                } finally {
                  setLoading(false);
                }
              }}
            >
              Create workspace
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={error} />
          <Field label="Workspace name" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Product" autoFocus />
          </Field>
          <Field label="Organisation" hint="Leave blank to reuse the workspace name.">
            <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Northwind Labs" />
          </Field>
          <p className="text-xs text-[var(--text-muted)]">
            You will be the owner. A <strong>#general</strong> channel is created automatically.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export default function AppEntryPage() {
  return (
    <Suspense fallback={null}>
      <WorkspacePicker />
    </Suspense>
  );
}
