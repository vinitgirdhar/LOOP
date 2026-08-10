import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, notFound, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ suggestionId: string; decision: string }> };

/**
 * Accepting a suggestion applies the change it proposed; rejecting only records
 * the decision. Either way the row keeps who decided and when, which is what
 * makes the Auto-Pilot auditable rather than magic.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const { suggestionId, decision } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'ai.suggestion.decide');

  if (decision !== 'accept' && decision !== 'reject') throw badRequest('Decision must be accept or reject');

  const { data: suggestion } = await ctx.supabase
    .from('ai_suggestions')
    .select('id, status, task_id, kind, proposed_change')
    .eq('id', suggestionId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .maybeSingle();

  if (!suggestion) throw notFound('Suggestion not found');
  if (suggestion.status !== 'PENDING') throw badRequest('That suggestion has already been decided');

  if (decision === 'accept' && suggestion.task_id) {
    const change = (suggestion.proposed_change ?? {}) as Record<string, unknown>;

    // Only the fields Auto-Pilot is allowed to propose are copied across; the
    // stored JSON is not trusted to name arbitrary columns.
    const allowed: Record<string, unknown> = {};
    if (typeof change.status === 'string') allowed.status = change.status;
    if (typeof change.assignee_id === 'string') allowed.assignee_id = change.assignee_id;
    if (typeof change.is_blocked === 'boolean') allowed.is_blocked = change.is_blocked;
    if (typeof change.estimate_hrs === 'number') allowed.estimate_hrs = change.estimate_hrs;
    if (typeof change.sprint_id === 'string') allowed.sprint_id = change.sprint_id;

    if (Object.keys(allowed).length > 0) {
      const { error } = await ctx.supabase
        .from('tasks')
        .update({ ...allowed, last_activity_at: new Date().toISOString() })
        .eq('id', suggestion.task_id)
        .eq('workspace_id', ctx.ws.workspaceId);

      assertOk(error, 'Task');
    }
  }

  const { data, error } = await ctx.supabase
    .from('ai_suggestions')
    .update({
      status: decision === 'accept' ? 'ACCEPTED' : 'REJECTED',
      decided_at: new Date().toISOString(),
      decided_by_id: ctx.user.id,
    })
    .eq('id', suggestionId)
    .select('*')
    .single();

  assertOk(error, 'Suggestion');
  return ok(data);
});
