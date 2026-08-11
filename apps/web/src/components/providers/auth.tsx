'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js';
import type { Permission, Role } from '@loop/shared';
import { can as canWithRole } from '@loop/shared';
import { setUnauthorizedHandler, setWorkspaceId } from '@/lib/api';
import { clearQueryCache } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  isPlatformAdmin: boolean;
  timezone: string;
}

export interface Membership {
  id: string;
  role: Role;
  workspace: { id: string; name: string; slug: string; logoUrl: string | null };
}

interface AuthContextValue {
  user: AuthUser | null;
  memberships: Membership[];
  workspaceId: string | null;
  role: Role | null;
  ready: boolean;
  /**
   * The workspace list has actually been read.
   *
   * `ready` only means "we know whether somebody is signed in". Between the two
   * flags `memberships` is legitimately empty, so anything that treats an empty
   * list as "not a member of this workspace" has to wait for this one instead.
   */
  membershipsReady: boolean;
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

interface MembershipRow {
  id: string;
  role: Role;
  workspace: { id: string; name: string; slug: string; logo_url: string | null } | null;
}

/**
 * Reads the profile row and workspace list for a signed-in user.
 *
 * Both queries run under row level security with this person's own session, so
 * they return exactly what that person is allowed to see — the browser is never
 * trusted to scope itself.
 */
async function loadSession(authUser: SupabaseUser): Promise<{ user: AuthUser; memberships: Membership[] }> {
  // listFactors() is deliberately absent: it only decides whether a "2FA on"
  // badge appears on the profile page, and awaiting it here put a third
  // network call in front of the first paint of every page in the app.
  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('id, email, name, avatar_url, is_platform_admin, timezone').eq('id', authUser.id).single(),
    supabase
      .from('workspace_members')
      .select('id, role, workspace:workspaces (id, name, slug, logo_url)')
      .eq('user_id', authUser.id),
  ]);

  const memberships: Membership[] = ((rows ?? []) as unknown as MembershipRow[])
    .filter((row): row is MembershipRow & { workspace: NonNullable<MembershipRow['workspace']> } => row.workspace !== null)
    .map((row) => ({
      id: row.id,
      role: row.role,
      workspace: {
        id: row.workspace.id,
        name: row.workspace.name,
        slug: row.workspace.slug,
        logoUrl: row.workspace.logo_url,
      },
    }));

  return {
    user: {
      id: authUser.id,
      email: profile?.email ?? authUser.email ?? '',
      name: profile?.name ?? (authUser.user_metadata?.name as string | undefined) ?? '',
      avatarUrl: profile?.avatar_url ?? null,
      emailVerifiedAt: authUser.email_confirmed_at ?? null,
      isPlatformAdmin: profile?.is_platform_admin ?? false,
      timezone: profile?.timezone ?? 'UTC',
    },
    memberships,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [membershipsReady, setMembershipsReady] = useState(false);
  const alive = useRef(true);

  /**
   * Paints the signed-in state straight off the access token.
   *
   * Everything here is already inside the JWT the browser is holding, so it
   * costs no network call. Waiting for the profile row before letting the app
   * render put a whole round trip in front of the shell, and the page below it
   * could not even begin its own fetch until that finished. Now the two run at
   * the same time and `applySession` fills in the rest when it lands.
   */
  const applyToken = useCallback((authUser: SupabaseUser) => {
    setUser((current) => current ?? {
      id: authUser.id,
      email: authUser.email ?? '',
      name: (authUser.user_metadata?.name as string | undefined) ?? authUser.email?.split('@')[0] ?? '',
      avatarUrl: null,
      emailVerifiedAt: authUser.email_confirmed_at ?? null,
      isPlatformAdmin: false,
      timezone: 'UTC',
    });
  }, []);

  const applySession = useCallback((session: { user: AuthUser; memberships: Membership[] }) => {
    setUser(session.user);
    setMemberships(session.memberships);
    setMembershipsReady(true);

    setWorkspace((current) => {
      const stored = current ?? (typeof window === 'undefined' ? null : localStorage.getItem(WORKSPACE_KEY));
      const valid = session.memberships.find((m) => m.workspace.id === stored)?.workspace.id;
      const next = valid ?? session.memberships[0]?.workspace.id ?? null;
      setWorkspaceId(next);
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setWorkspaceId(null);
    setUser(null);
    setMemberships([]);
    setMembershipsReady(true);
    // Cached responses belong to the account that fetched them.
    clearQueryCache();
  }, []);

  /**
   * Supabase renews the access token on its own timer, and the middleware does
   * the same for server requests, so this only has to re-read what is already
   * there — there is no manual renewal clock to keep any more.
   */
  const refresh = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      clearSession();
      return false;
    }
    applySession(await loadSession(data.session.user));
    return true;
  }, [applySession, clearSession]);

  useEffect(() => {
    alive.current = true;

    const hydrate = async (session: SupabaseSession | null) => {
      if (!session) {
        clearSession();
        return;
      }
      // Synchronous, before the await: the caller below relies on the signed-in
      // state landing in the same tick as `ready`.
      applyToken(session.user);
      const loaded = await loadSession(session.user);
      if (alive.current) applySession(loaded);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive.current) return;
      // The gate lifts on the token, not on the profile query behind it.
      void hydrate(data.session);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED fires on every silent renewal. Re-reading the profile
      // each time would be a query storm carrying no new information.
      if (event === 'TOKEN_REFRESHED') return;
      void hydrate(session);
    });

    return () => {
      alive.current = false;
      listener.subscription.unsubscribe();
    };
  }, [applySession, applyToken, clearSession]);

  useEffect(() => {
    // A 401 from a route handler means the cookie is gone or no longer valid.
    // Check once more, and if there is genuinely no session left send the user
    // to sign in rather than leaving them on a page that cannot load.
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);

      // With MFA enrolled the password alone only reaches aal1. The session
      // cannot read protected data until a TOTP code lifts it to aal2.
      const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (levels && levels.nextLevel === 'aal2' && levels.nextLevel !== levels.currentLevel) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const factorId = (factors?.totp ?? []).find((factor) => factor.status === 'verified')?.id;
        if (factorId) return { twoFactorRequired: true, ticket: factorId };
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) applySession(await loadSession(data.session.user));
      return {};
    },
    [applySession],
  );

  const loginWith2fa: AuthContextValue['loginWith2fa'] = useCallback(
    async (ticket, code) => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: ticket, code });
      if (error) throw new Error(error.message);

      const { data } = await supabase.auth.getSession();
      if (data.session) applySession(await loadSession(data.session.user));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    // Clear locally first: even if the network call fails, the session must not
    // survive the click that ended it.
    try {
      await supabase.auth.signOut();
    } catch {
      /* the cookie is dropped locally regardless */
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
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const loaded = await loadSession(data.user);
    setUser(loaded.user);
    setMemberships(loaded.memberships);
  }, []);

  const role = useMemo(() => memberships.find((m) => m.workspace.id === workspace)?.role ?? null, [memberships, workspace]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      memberships,
      workspaceId: workspace,
      role,
      ready,
      membershipsReady,
      // Mirrors the database's permission matrix so the UI hides what row level
      // security would reject anyway.
      can: (permission: Permission) => (user?.isPlatformAdmin ? true : canWithRole(role, permission)),
      login,
      loginWith2fa,
      logout,
      refresh,
      selectWorkspace,
      reloadMemberships,
    }),
    [user, memberships, workspace, role, ready, membershipsReady, login, loginWith2fa, logout, refresh, selectWorkspace, reloadMemberships],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
