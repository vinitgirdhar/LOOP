import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, notFound, ok, route } from '@/lib/server/http';

const schema = z.object({
  taskKey: z.string().trim().min(3).max(20),
  event: z.enum(['push', 'pull_request', 'create']).default('push'),
  message: z.string().trim().max(300).default('Simulated commit'),
});

/**
 * Replays what a real GitHub webhook would do, for demos and for testing the
 * Auto-Pilot rules without wiring a repository up first.
 *
 * The task reference is a project key and number (PAY-7), which is how commit
 * messages name work.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.integration.manage');
  const input = await body(request, schema);

  const [projectKey, rawNumber] = input.taskKey.toUpperCase().split('-');
  const number = Number(rawNumber);
  if (!projectKey || !Number.isInteger(number)) throw notFound('Use a task key like PAY-7');

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', ctx.ws.workspaceId)
    .eq('key', projectKey)
    .maybeSingle();

  if (!project) throw notFound(`No project with key ${projectKey}`);

  const { data: task } = await ctx.supabase
    .from('tasks')
    .select('id, title')
    .eq('project_id', project.id)
    .eq('number', number)
    .maybeSingle();

  if (!task) throw notFound(`No task ${input.taskKey}`);

  const { error } = await ctx.supabase.from('activity_log').insert({
    workspace_id: ctx.ws.workspaceId,
    project_id: project.id,
    task_id: task.id,
    actor_id: ctx.user.id,
    type: 'INTEGRATION',
    message: `GitHub ${input.event}: ${input.message}`,
    meta: { provider: 'github', event: input.event, simulated: true },
  });

  assertOk(error, 'Activity');

  await ctx.supabase
    .from('tasks')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', task.id);

  return ok({ taskId: task.id, taskKey: input.taskKey, recorded: true });
});
