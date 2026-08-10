import { notFound, ok, route } from '@/lib/server/http';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { params: Promise<{ token: string }> };

/**
 * Read before signing in.
 *
 * The invite screen has to render for someone with no session at all, so this
 * reads with the service role — and deliberately returns only the workspace
 * name and the invited address, never the whole row.
 */
export const GET = route(async (_request: Request, { params }: Params) => {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('invites')
    .select('email, role, expires_at, accepted_at, workspace:workspaces (name, slug, logo_url)')
    .eq('token', token)
    .maybeSingle();

  if (!invite) throw notFound('That invitation link is not valid');

  return ok({
    email: invite.email,
    role: invite.role,
    workspace: invite.workspace,
    expired: Date.parse(invite.expires_at) < Date.now(),
    accepted: invite.accepted_at !== null,
  });
});
