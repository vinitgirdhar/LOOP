'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth';
import { AppShell, ShellLoading } from '@/components/shell/app-shell';

export default function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const router = useRouter();
  const { ready, user, memberships, workspaceId: active, selectWorkspace } = useAuth();

  const isMember = memberships.some((m) => m.workspace.id === workspaceId);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?next=/w/${workspaceId}`);
      return;
    }
    if (!isMember && !user.isPlatformAdmin) {
      router.replace('/app');
      return;
    }
    if (active !== workspaceId) selectWorkspace(workspaceId);
  }, [ready, user, isMember, active, workspaceId, router, selectWorkspace]);

  // Wait until the API client knows which workspace to scope requests to,
  // otherwise the first fetch of every page would 403.
  if (!ready || !user || active !== workspaceId) return <ShellLoading />;

  return <AppShell workspaceId={workspaceId}>{children}</AppShell>;
}
