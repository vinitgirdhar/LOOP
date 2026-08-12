import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { badRequest, body, ok, route } from '@/lib/server/http';
import { GITHUB_EVENTS, suggestFromGithubEvent } from '@/lib/server/autopilot';

/**
 * Replays what a real GitHub webhook would do.
 *
 * The schema matches the form that posts to it. It previously required a
 * `taskKey` the UI never sent, so every attempt failed Zod validation with
 * "Invalid input" — and even on success it only wrote an activity row and
 * created no suggestion at all, which is why the Auto-Pilot inbox was always
 * empty. Both sides now go through the same rules engine a real webhook uses.
 */
const schema = z.object({
  kind: z.enum(GITHUB_EVENTS).default('pull_request_opened'),
  reference: z.string().trim().min(1).max(300),
  repo: z.string().trim().min(1).max(140).default('demo/repository'),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.integration.manage');
  const input = await body(request, schema);

  const outcome = await suggestFromGithubEvent(ctx.supabase, {
    workspaceId: ctx.ws.workspaceId,
    actorId: ctx.user.id,
    event: input.kind,
    reference: input.reference,
    repo: input.repo,
  });

  // A reference with no task key at all is a mistake worth naming, rather than
  // a silent success that leaves the reader wondering where their card went.
  if (outcome.matched.length === 0 && outcome.skipped.length === 0) {
    throw badRequest('No task key found in that reference. Use something like feat/PAY-4-refund-flow.');
  }

  return ok({
    suggestions: outcome.created,
    matched: outcome.matched,
    skipped: outcome.skipped,
  });
});
