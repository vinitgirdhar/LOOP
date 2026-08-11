import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';
import { SHARE_SCOPES, mintToken } from '@/lib/server/share';

type Params = { params: Promise<{ projectId: string }> };

/** The links that exist for this project. Never includes a usable token. */
export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('project_share_links')
    .select('id, label, scopes, token_hint, expires_at, revoked_at, view_count, last_seen_at, created_at, createdBy:profiles (id, name)')
    .eq('project_id', projectId)
    .eq('workspace_id', ws.workspaceId)
    .order('created_at', { ascending: false });

  assertOk(error, 'Share links');
  return ok(data ?? []);
});

const createSchema = z.object({
  label: z.string().trim().max(80).optional(),
  scopes: z.array(z.enum(SHARE_SCOPES)).min(1).default(['progress']),
  /** Days until the link stops working. Omit for a link that never expires. */
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

/**
 * Mints a link.
 *
 * The plaintext token is in this response and nowhere else, ever — it is not
 * recoverable afterwards because only its hash is stored. The UI has to make
 * that obvious, which is why the response names the field `token` and the
 * listing above only ever returns `tokenHint`.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');

  const input = await body(request, createSchema);
  const { token, hash, hint } = mintToken();

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
    : null;

  const { data, error } = await ctx.supabase
    .from('project_share_links')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      project_id: projectId,
      token_hash: hash,
      token_hint: hint,
      label: input.label ?? null,
      scopes: input.scopes,
      expires_at: expiresAt,
      created_by: ctx.user.id,
    })
    .select('id, label, scopes, token_hint, expires_at, revoked_at, view_count, created_at')
    .single();

  assertOk(error, 'Share link');
  return created({ ...data, token });
});
