import { z } from 'zod';
import { requireUser } from '@/lib/server/context';
import { assertOk, badRequest, body, created, ok, route } from '@/lib/server/http';
import { recordAudit } from '@/lib/server/audit';
import { planByKey, priceFor, type Cadence } from '@/lib/plans';

/**
 * The signed-in person's plan and their receipts.
 *
 * Checkout is only reachable once somebody is signed in, so a purchase always
 * has an owner to attach to — which is the whole reason this endpoint can
 * exist. The newest ACTIVE row is the current plan; the rest are history.
 */
export const GET = route(async () => {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  assertOk(error, 'Subscriptions');

  const rows = data ?? [];
  const now = Date.now();
  // A row is only current if it has not been cancelled and its period is still
  // running: an expired subscription must not keep showing as the active plan.
  const active =
    rows.find((row) => row.status === 'ACTIVE' && new Date(row.current_period_end as string).getTime() > now) ?? null;

  return ok({ active, receipts: rows });
});

const schema = z.object({
  planKey: z.enum(['team', 'business']),
  cadence: z.enum(['monthly', 'annual']),
  paymentId: z.string().trim().min(4).max(64),
  method: z.string().trim().max(32).optional(),
});

/**
 * Records a completed checkout.
 *
 * The amount is resolved from the plan table here rather than read off the
 * request, so a crafted call cannot buy Business for ₹1. The client says which
 * plan it settled, never what it cost.
 */
export const POST = route(async (request: Request) => {
  const { supabase, user } = await requireUser();
  const input = await body(request, schema);

  const plan = planByKey(input.planKey);
  if (!plan) throw badRequest('Unknown plan');

  const amount = priceFor(plan, input.cadence as Cadence);
  const periodEnd = new Date();
  if (input.cadence === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Supersede whatever they were on: one active plan per person.
  await supabase
    .from('subscriptions')
    .update({ status: 'EXPIRED' })
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');

  const { data: planRow } = await supabase.from('billing_plans').select('id').eq('key', plan.key).maybeSingle();

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: user.id,
      plan_id: planRow?.id ?? null,
      plan_key: plan.key,
      plan_name: plan.name,
      amount_inr: amount,
      cadence: input.cadence,
      payment_id: input.paymentId,
      method: input.method ?? null,
      status: 'ACTIVE',
      // The checkout settles locally; nothing was captured by a real gateway.
      is_test: true,
      current_period_end: periodEnd.toISOString(),
    })
    .select('*')
    .single();

  assertOk(error, 'Subscription');

  await recordAudit({
    workspaceId: null,
    actorId: user.id,
    action: 'subscription.created',
    entity: 'subscription',
    entityId: data!.id as string,
    meta: { planKey: plan.key, cadence: input.cadence, amountInr: amount, test: true },
  });

  return created(data);
});
