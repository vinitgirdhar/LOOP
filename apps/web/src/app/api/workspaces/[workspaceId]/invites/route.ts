import { z } from 'zod';
import { ROLES } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, body, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const ctx = await requireMember(request, await params);
  await requirePermission(ctx, ctx.ws, 'workspace.invite');

  const { data, error } = await ctx.supabase
    .from('invites')
    .select('*, invitedBy:profiles (id, name, avatar_url)')
    .eq('workspace_id', ctx.ws.workspaceId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  assertOk(error, 'Invites');
  return ok(data ?? []);
});

const schema = z.object({
  email: z.string().trim().toLowerCase().email('That does not look like an email address'),
  role: z.enum(ROLES).default('MEMBER'),
});

const INVITE_DAYS = 7;

export const POST = route(async (request: Request, { params }: Params) => {
  const ctx = await requireMember(request, await params);
  await requirePermission(ctx, ctx.ws, 'workspace.invite');
  const input = await body(request, schema);

  const { data: profile } = await ctx.supabase.from('profiles').select('id').eq('email', input.email).maybeSingle();
  if (profile) {
    const { data: already } = await ctx.supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', ctx.ws.workspaceId)
      .eq('user_id', profile.id)
      .maybeSingle();
    if (already) throw badRequest('That person is already in this workspace');
  }

  const { data, error } = await ctx.supabase
    .from('invites')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      email: input.email,
      role: input.role,
      token: crypto.randomUUID().replace(/-/g, ''),
      invited_by_id: ctx.user.id,
      expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    })
    .select('*')
    .single();

  assertOk(error, 'Invite');
  return created(data);
});
