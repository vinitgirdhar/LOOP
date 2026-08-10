import { requireUser } from '@/lib/server/context';
import { badRequest, forbidden, ok, route } from '@/lib/server/http';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { params: Promise<{ token: string }> };

/**
 * Accepting an invitation is the second write that cannot use the caller's own
 * session: they are not a member yet, so `workspace_members` is closed to them.
 * The token plus a matching email address is the authorisation, and both are
 * checked here before the service role touches anything.
 */
export const POST = route(async (_request: Request, { params }: Params) => {
  const { token } = await params;
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('invites')
    .select('id, workspace_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) throw badRequest('That invitation link is not valid');
  if (invite.accepted_at) throw badRequest('That invitation has already been used');
  if (Date.parse(invite.expires_at) < Date.now()) throw badRequest('That invitation has expired');

  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden(`This invitation was sent to ${invite.email}. Sign in with that address to accept it.`);
  }

  const { data: existing } = await admin
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', invite.workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existing) {
    const { error } = await admin
      .from('workspace_members')
      .insert({ workspace_id: invite.workspace_id, user_id: user.id, role: invite.role });
    if (error) throw badRequest(error.message);
  }

  await admin.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);

  return ok({ workspaceId: invite.workspace_id });
});
