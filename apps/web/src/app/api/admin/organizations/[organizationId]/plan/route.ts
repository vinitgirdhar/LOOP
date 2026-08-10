import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ organizationId: string }> };

const schema = z.object({ planId: z.string().uuid().nullable() });

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { organizationId } = await params;
  const { supabase } = await requirePlatformAdmin();
  const { planId } = await body(request, schema);

  const { data, error } = await supabase
    .from('organizations')
    .update({ plan_id: planId })
    .eq('id', organizationId)
    .select('id, name, plan:billing_plans (id, key, name)')
    .single();

  assertOk(error, 'Organisation');
  return ok(data);
});
