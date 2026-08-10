import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { assertOk, badRequest, body, created, ok, route } from '@/lib/server/http';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = route(async () => {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, role, joined_at, workspace:workspaces (id, name, slug, logo_url, description, created_at)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true });

  assertOk(error, 'Workspaces');
  return ok(data ?? []);
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'Give the workspace a name').max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes')
    .min(2)
    .max(40)
    .optional(),
  description: z.string().trim().max(500).optional(),
});

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';

/**
 * Founding a workspace is the one write that cannot go through the caller's own
 * session.
 *
 * `workspace_members` may only be written by someone who already holds
 * `member.manage` *in that workspace*, so the very first OWNER row has nobody
 * who could legitimately insert it — the rule that keeps everyone else out also
 * locks the founder out. The service-role client is used for exactly these
 * three inserts, with the owner pinned to the authenticated caller so it cannot
 * be turned into a way to join someone else's workspace.
 */
export const POST = route(async (request: Request) => {
  const { user } = await requireUser();
  const input = await body(request, createSchema);

  const admin = createAdminClient();
  const slug = input.slug ?? slugify(input.name);

  const { data: taken } = await admin.from('workspaces').select('id').eq('slug', slug).maybeSingle();
  if (taken) throw badRequest('That workspace address is already taken');

  const { data: freePlan } = await admin.from('billing_plans').select('id').eq('key', 'free').maybeSingle();

  const { data: organization, error: orgFailed } = await admin
    .from('organizations')
    .insert({ name: input.name, slug: `${slug}-org`, owner_id: user.id, plan_id: freePlan?.id ?? null })
    .select('id')
    .single();
  assertOk(orgFailed, 'Organisation');

  const { data: workspace, error: wsFailed } = await admin
    .from('workspaces')
    .insert({
      organization_id: organization!.id,
      name: input.name,
      slug,
      description: input.description ?? null,
    })
    .select('*')
    .single();

  if (wsFailed) {
    // Nothing else references the organisation yet, so removing it keeps a
    // failed attempt from leaving an orphan nobody can see or delete.
    await admin.from('organizations').delete().eq('id', organization!.id);
    assertOk(wsFailed, 'Workspace');
  }

  const { error: memberFailed } = await admin
    .from('workspace_members')
    .insert({ workspace_id: workspace!.id, user_id: user.id, role: 'OWNER' });

  if (memberFailed) {
    await admin.from('workspaces').delete().eq('id', workspace!.id);
    await admin.from('organizations').delete().eq('id', organization!.id);
    assertOk(memberFailed, 'Membership');
  }

  return created(workspace);
});
