import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ logId: string }> };

const schema = z.object({
  seconds: z.number().int().min(1).max(86400).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { logId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('time_logs')
    .update({
      ...(input.seconds !== undefined ? { seconds: input.seconds } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    })
    .eq('id', logId)
    .eq('user_id', ctx.user.id)
    .select('*')
    .single();

  assertOk(error, 'Time log');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { logId } = await params;
  const ctx = await requireMember(request);

  const { error } = await ctx.supabase.from('time_logs').delete().eq('id', logId).eq('user_id', ctx.user.id);
  assertOk(error, 'Time log');
  return ok({ deleted: true });
});
