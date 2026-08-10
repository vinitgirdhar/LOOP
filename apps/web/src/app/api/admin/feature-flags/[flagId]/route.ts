import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ flagId: string }> };

const schema = z.object({
  enabled: z.boolean().optional(),
  rollout: z.number().int().min(0).max(100).optional(),
  description: z.string().trim().max(300).nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { flagId } = await params;
  const { supabase } = await requirePlatformAdmin();
  const input = await body(request, schema);

  const { data, error } = await supabase
    .from('feature_flags')
    .update({
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.rollout !== undefined ? { rollout: input.rollout } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', flagId)
    .select('*')
    .single();

  assertOk(error, 'Feature flag');
  return ok(data);
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const { flagId } = await params;
  const { supabase } = await requirePlatformAdmin();

  const { error } = await supabase.from('feature_flags').delete().eq('id', flagId);
  assertOk(error, 'Feature flag');
  return ok({ deleted: true });
});
