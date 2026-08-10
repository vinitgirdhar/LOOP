import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

export const GET = route(async () => {
  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase.from('feature_flags').select('*').order('key');
  assertOk(error, 'Feature flags');
  return ok(data ?? []);
});

const schema = z.object({
  key: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  enabled: z.boolean().default(false),
  rollout: z.number().int().min(0).max(100).default(0),
});

export const POST = route(async (request: Request) => {
  const { supabase } = await requirePlatformAdmin();
  const input = await body(request, schema);

  const { data, error } = await supabase
    .from('feature_flags')
    .insert({
      key: input.key,
      description: input.description ?? null,
      enabled: input.enabled,
      rollout: input.rollout,
    })
    .select('*')
    .single();

  assertOk(error, 'Feature flag');
  return created(data);
});
