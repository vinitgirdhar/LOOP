import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { badRequest, body, ok, route } from '@/lib/server/http';
import { chat, isAiConfigured } from '@/lib/server/ai';

const schema = z.object({
  projectId: z.string().uuid(),
  capacity: z.number().int().min(1).max(500).default(40),
});

/**
 * Proposes a sprint from the open backlog. It only suggests — nothing is
 * written until someone accepts it on the sprint screen.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'sprint.manage');
  const input = await body(request, schema);

  if (!isAiConfigured()) throw badRequest('AI is not configured on this deployment');

  const { data: backlog } = await ctx.supabase
    .from('tasks')
    .select('id, number, title, priority, story_points, estimate_hrs')
    .eq('project_id', input.projectId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .is('sprint_id', null)
    .is('completed_at', null)
    .limit(60);

  const items = backlog ?? [];
  if (items.length === 0) return ok({ picked: [], rationale: 'The backlog is empty.' });

  const reply = await chat([
    {
      role: 'system',
      content:
        'You plan sprints. Given a backlog and a capacity in story points, choose the set that fits, ' +
        'favouring higher priority. Reply with strict JSON only: {"ids": string[], "rationale": string}.',
    },
    {
      role: 'user',
      content: `Capacity: ${input.capacity} points\n\nBacklog:\n${items
        .map((task) => `${task.id} | ${task.title} | ${task.priority} | ${task.story_points ?? '?'} pts`)
        .join('\n')}`,
    },
  ]);

  const match = reply.match(/\{[\s\S]*\}/);
  const valid = new Set(items.map((task) => task.id));

  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { ids?: unknown; rationale?: string };
      const ids = Array.isArray(parsed.ids) ? parsed.ids.filter((id): id is string => typeof id === 'string' && valid.has(id)) : [];
      return ok({ picked: items.filter((task) => ids.includes(task.id)), rationale: parsed.rationale ?? '' });
    } catch {
      /* fall through to the deterministic pick */
    }
  }

  // Model unusable: fall back to greedy by priority so the screen still works.
  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
  const picked: typeof items = [];
  let used = 0;
  for (const task of [...items].sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9))) {
    const points = task.story_points ?? 3;
    if (used + points > input.capacity) continue;
    picked.push(task);
    used += points;
  }

  return ok({ picked, rationale: 'Selected by priority to fit the capacity.' });
});
