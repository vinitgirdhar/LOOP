import type { SupabaseClient } from '@supabase/supabase-js';
import type { Permission, Role } from '@loop/shared';
import { createClient } from '@/lib/supabase/server';
import { forbidden, notFound, unauthorized } from './http';
import { toDatabasePermission } from './permissions';

export interface Caller {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

export interface WorkspaceContext {
  workspaceId: string;
  role: Role;
  /** A platform admin acting outside their own membership. */
  viaAdmin: boolean;
}

export interface Ctx {
  supabase: SupabaseClient;
  user: Caller;
}

/**
 * Resolves the signed-in user.
 *
 * `getUser()` revalidates the token against the auth server rather than
 * trusting the cookie, which is the difference between an authentication check
 * and a decoration — `getSession()` must never be used here.
 */
export async function requireUser(): Promise<Ctx> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw unauthorized();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, is_platform_admin, is_suspended')
    .eq('id', data.user.id)
    .single();

  if (!profile) throw unauthorized('Your profile is not set up yet');
  if (profile.is_suspended) throw forbidden('This account is suspended');

  return {
    supabase,
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      isPlatformAdmin: profile.is_platform_admin,
    },
  };
}

export async function requirePlatformAdmin(): Promise<Ctx> {
  const ctx = await requireUser();
  if (!ctx.user.isPlatformAdmin) throw forbidden('Platform admin only');
  return ctx;
}

/**
 * Finds the workspace the request is about, in the same precedence the Express
 * API used, so existing callers keep working unchanged.
 */
export function workspaceIdFrom(request: Request, params?: Record<string, string | undefined>, payload?: unknown): string | null {
  const fromBody =
    typeof payload === 'object' && payload !== null
      ? ((payload as Record<string, unknown>).workspaceId as string | undefined)
      : undefined;

  return (
    params?.workspaceId ??
    request.headers.get('x-workspace-id') ??
    new URL(request.url).searchParams.get('workspaceId') ??
    fromBody ??
    null
  );
}

/**
 * Resolves the caller's role inside a workspace.
 *
 * RLS already blocks cross-tenant reads, so this is not the security boundary —
 * it exists to turn a silent empty result into an explicit 403, which is what
 * the UI needs to show a useful message.
 */
export async function requireWorkspace(
  ctx: Ctx,
  request: Request,
  params?: Record<string, string | undefined>,
  payload?: unknown,
): Promise<WorkspaceContext> {
  const workspaceId = workspaceIdFrom(request, params, payload);
  if (!workspaceId) throw forbidden('Missing workspace context');

  const { data: member } = await ctx.supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (member) return { workspaceId, role: member.role as Role, viaAdmin: false };

  if (ctx.user.isPlatformAdmin) {
    const { data: workspace } = await ctx.supabase.from('workspaces').select('id').eq('id', workspaceId).maybeSingle();
    if (!workspace) throw notFound('Workspace not found');
    return { workspaceId, role: 'OWNER', viaAdmin: true };
  }

  throw forbidden('You are not a member of this workspace');
}

/**
 * Permission gate, asked of the database rather than a copy of the matrix.
 *
 * `app_has_permission` resolves through role_permissions, the same rows the RLS
 * write policies use, so this check and the one Postgres enforces can never
 * disagree.
 */
export async function requirePermission(ctx: Ctx, ws: WorkspaceContext, permission: Permission): Promise<void> {
  if (ws.viaAdmin) return;

  const key = toDatabasePermission(permission);
  // No database equivalent means membership is the whole requirement, and that
  // was already established by requireWorkspace.
  if (!key) return;

  const { data, error } = await ctx.supabase.rpc('app_has_permission', {
    p_workspace: ws.workspaceId,
    p_permission: key,
  });

  if (error) {
    console.error('[api] permission check failed', error);
    throw forbidden();
  }
  if (!data) throw forbidden();
}

/** Convenience for the common "authenticated, in a workspace" opening of a handler. */
export async function requireMember(
  request: Request,
  params?: Record<string, string | undefined>,
  payload?: unknown,
): Promise<Ctx & { ws: WorkspaceContext }> {
  const ctx = await requireUser();
  const ws = await requireWorkspace(ctx, request, params, payload);
  return { ...ctx, ws };
}
