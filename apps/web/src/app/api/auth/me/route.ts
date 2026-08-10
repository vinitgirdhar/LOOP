import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

/** The signed-in user plus the workspaces they belong to. */
export const GET = route(async () => {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('workspace_members')
      .select('id, role, workspace:workspaces (id, name, slug, logo_url)')
      .eq('user_id', user.id),
  ]);

  return ok({
    user: { ...profile, emailVerifiedAt: null, twoFactorOn: false },
    memberships: rows ?? [],
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const PATCH = route(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const input = await body(request, patchSchema);

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    })
    .eq('id', user.id)
    .select('*')
    .single();

  assertOk(error, 'Profile');
  return ok(data);
});
