'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Permission, Role } from '@loop/shared';
import { can as canWithRole } from '@loop/shared';
import { api, setAccessToken, setUnauthorizedHandler, setWorkspaceId } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  isPlatformAdmin: boolean;
  twoFactorOn: boolean;
  timezone: string;
}

export interface Membership {
  id: string;
  role: Role;
  workspace: { id: string; name: string; slug: string; logoUrl: string | null };
}

interface Session {
  accessToken: string;
  user: AuthUser;
  memberships: Membership[];
}

interface AuthContextValue {
  user: AuthUser | null;
  memberships: Membership[];
  workspaceId: string | null;
  role: Role | null;
  ready: boolean;
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<{ twoFactorRequired?: boolean; ticket?: string }>;
  loginWith2fa: (ticket: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  selectWorkspace: (id: string | null) => void;
  reloadMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

const WORKSPACE_KEY = 'loop-workspace';

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySession = useCallback((session: Session) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setMemberships(session.memberships);

    setWorkspace((current) => {
      const stored = current ?? (typeof window === 'undefined' ? null : localStorage.getItem(WORKSPACE_KEY));
      const valid = session.memberships.find((m) => m.workspace.id === stored)?.workspace.id;
      const next = valid ?? session.memberships[0]?.workspace.id ?? null;
      setWorkspaceId(next);
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setWorkspaceId(null);
    setUser(null);
    setMemberships([]);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await api.post<Session>('/api/auth/refresh');
      applySession(data);
      // Access tokens last 15 minutes; renew a couple of minutes early.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 13 * 60 * 1000);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  useEffect(() => {
    // A 401 means the access token expired. Try to renew it once; if the
    // refresh cookie is gone too the session is genuinely over, so send the
    // user to sign in rather than leaving them on a page that cannot load.
    setUnauthorizedHandler(() => {
      void refresh().then((renewed) => {
        if (renewed) return;
        const here = window.location.pathname + window.location.search;
        if (here.startsWith('/login')) return;
        router.replace(`/login?next=${encodeURIComponent(here)}`);
      });
    });
    return () => setUnauthorizedHandler(null);
  }, [refresh, router]);

  const login: AuthContextValue['login'] = useCallback(
    async (email, password) => {
      const { data } = await api.post<Session & { twoFactorRequired?: boolean; ticket?: string }>('/api/auth/login', { email, password });
      if (data.twoFactorRequired) return { twoFactorRequired: true, ticket: data.ticket };
      applySession(data);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 13 * 60 * 1000);
      return {};
    },
    [applySession, refresh],
  );

  const loginWith2fa: AuthContextValue['loginWith2fa'] = useCallback(
    async (ticket, code) => {
      const { data } = await api.post<Session>('/api/auth/login/2fa', { ticket, code });
      applySession(data);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    // Clear locally first: even if the network call fails, the session must not
    // survive the click that ended it.
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* the cookie is cleared server-side on the next refresh attempt anyway */
    } finally {
      clearSession();
      if (typeof window !== 'undefined') localStorage.removeItem(WORKSPACE_KEY);
      setWorkspace(null);
      router.replace('/login');
    }
  }, [clearSession, router]);

  const selectWorkspace = useCallback((id: string | null) => {
    setWorkspace(id);
    setWorkspaceId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(WORKSPACE_KEY, id);
      else localStorage.removeItem(WORKSPACE_KEY);
    }
  }, []);

  const reloadMemberships = useCallback(async () => {
    const { data } = await api.get<{ user: AuthUser; memberships: Membership[] }>('/api/auth/me');
    setUser(data.user);
    setMemberships(data.memberships);
  }, []);

  const role = useMemo(() => memberships.find((m) => m.workspace.id === workspace)?.role ?? null, [memberships, workspace]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      memberships,
      workspaceId: workspace,
      role,
      ready,
      // Mirrors the API's matrix so the UI hides what the server would reject.
      can: (permission: Permission) => (user?.isPlatformAdmin ? true : canWithRole(role, permission)),
      login,
      loginWith2fa,
      logout,
      refresh,
      selectWorkspace,
      reloadMemberships,
    }),
    [user, memberships, workspace, role, ready, login, loginWith2fa, logout, refresh, selectWorkspace, reloadMemberships],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
