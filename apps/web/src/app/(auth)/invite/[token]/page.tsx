'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS, type Role } from '@loop/shared';
import { AuthCard, AuthFooterLink, FormError } from '@/components/auth-form';
import { Avatar, Button, Skeleton } from '@/components/ui';
import { useQuery } from '@/lib/hooks';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/components/providers/auth';

interface InvitePreview {
  email: string;
  role: Role;
  expiresAt: string;
  workspace: { id: string; name: string; logoUrl: string | null };
  invitedBy: { name: string };
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, ready, reloadMemberships, selectWorkspace } = useAuth();
  const { data: invite, loading, error } = useQuery<InvitePreview>(`/api/invites/${token}`);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  if (loading || !ready) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <AuthCard title="This invite is no longer valid" subtitle="It may have been revoked, already used, or simply expired." footer={<AuthFooterLink href="/login">Go to sign in</AuthFooterLink>}>
        <FormError message={error ?? 'Invite not found'} />
      </AuthCard>
    );
  }

  const wrongAccount = user && user.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <AuthCard title={`Join ${invite.workspace.name}`} subtitle={`${invite.invitedBy.name} invited ${invite.email} as ${ROLE_LABELS[invite.role]}.`}>
      <div className="card flex items-center gap-3 p-4">
        <Avatar name={invite.workspace.name} src={invite.workspace.logoUrl} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{invite.workspace.name}</p>
          <p className="text-xs text-[var(--text-muted)]">{ROLE_LABELS[invite.role]}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <FormError message={joinError} />

        {!user ? (
          <>
            <p className="text-[13px] text-[var(--text-muted)]">Sign in as {invite.email} to accept.</p>
            <Button variant="primary" className="w-full" onClick={() => router.push(`/login?next=/invite/${token}`)}>
              Sign in to accept
            </Button>
            <Button className="w-full" onClick={() => router.push('/register')}>
              Create an account
            </Button>
          </>
        ) : wrongAccount ? (
          <>
            <p className="text-[13px] text-[var(--danger)]">
              You are signed in as {user.email}, but this invite was sent to {invite.email}.
            </p>
            <Button className="w-full" onClick={() => router.push(`/login?next=/invite/${token}`)}>
              Switch account
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            className="w-full"
            loading={joining}
            onClick={async () => {
              setJoinError(null);
              setJoining(true);
              try {
                const { data } = await api.post<{ workspaceId: string }>(`/api/invites/${token}/accept`);
                await reloadMemberships();
                selectWorkspace(data.workspaceId);
                router.replace(`/w/${data.workspaceId}`);
              } catch (caught: unknown) {
                setJoinError(apiErrorMessage(caught));
              } finally {
                setJoining(false);
              }
            }}
          >
            Accept invite
          </Button>
        )}
      </div>
    </AuthCard>
  );
}
