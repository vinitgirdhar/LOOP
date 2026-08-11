'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth';
import { AppShell, ShellLoading } from '@/components/shell/app-shell';
import { setWorkspaceId } from '@/lib/api';

export default function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const router = useRouter();
  const { ready, user, memberships, selectWorkspace } = useAuth();

  // Synchronously update the API module's workspace ID so fetch calls from child components
  // immediately include the correct x-workspace-id header without waiting for a re-render.
  setWorkspaceId(workspaceId);

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
    selectWorkspace(workspaceId);
  }, [ready, user, isMember, workspaceId, router, selectWorkspace]);

  // Wait until initial auth hydration completes before rendering the shell.
  // Once ready and user are present, keep AppShell mounted across page transitions.
  if (!ready || !user) return <ShellLoading />;

  return <AppShell workspaceId={workspaceId}>{children}</AppShell>;
}
