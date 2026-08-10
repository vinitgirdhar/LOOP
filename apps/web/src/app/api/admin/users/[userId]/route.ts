import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, badRequest, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ userId: string }> };

const schema = z.object({
  isSuspended: z.boolean().optional(),
  isPlatformAdmin: z.boolean().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { userId } = await params;
  const { supabase, user } = await requirePlatformAdmin();
  const input = await body(request, schema);

  // Removing your own admin rights, or suspending yourself, would lock the last
  // administrator out of the platform.
  if (userId === user.id && (input.isPlatformAdmin === false || input.isSuspended === true)) {
    throw badRequest('You cannot remove your own platform access');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...(input.isSuspended !== undefined ? { is_suspended: input.isSuspended } : {}),
      ...(input.isPlatformAdmin !== undefined ? { is_platform_admin: input.isPlatformAdmin } : {}),
    })
    .eq('id', userId)
    .select('id, name, email, is_platform_admin, is_suspended')
    .single();

  assertOk(error, 'User');
  return ok(data);
});
