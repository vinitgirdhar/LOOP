import { requireMember } from '@/lib/server/context';
import { badRequest, notFound, ok, route } from '@/lib/server/http';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { chat, isAiConfigured } from '@/lib/server/ai';

type Params = { params: Promise<{ taskId: string }> };

export const POST = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const ctx = await requireMember(request);
  const { supabase, ws } = ctx;
  await enforceRateLimit(supabase, 'ai', ctx.user.id);

  if (!isAiConfigured()) throw badRequest('AI is not configured on this deployment');

  const { data: task } = await supabase
    .from('tasks')
    .select('title, description, story_points, priority')
    .eq('id', taskId)
    .eq('workspace_id', ws.workspaceId)
    .maybeSingle();

  if (!task) throw notFound('Task not found');

  const reply = await chat([
    {
      role: 'system',
      content:
        'Estimate software tasks. Reply with strict JSON only: ' +
        '{"hours": number, "points": number, "rationale": string}. No prose outside the JSON.',
    },
    {
      role: 'user',
      content: `Title: ${task.title}\nPriority: ${task.priority}\nDescription: ${task.description ?? '(none)'}`,
    },
  ]);

  // The model is asked for JSON but is not trusted to return only JSON.
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return ok({ hours: null, points: null, rationale: reply.slice(0, 500) });

  try {
    const parsed = JSON.parse(match[0]) as { hours?: number; points?: number; rationale?: string };
    return ok({
      hours: typeof parsed.hours === 'number' ? parsed.hours : null,
      points: typeof parsed.points === 'number' ? parsed.points : null,
      rationale: parsed.rationale ?? '',
    });
  } catch {
    return ok({ hours: null, points: null, rationale: reply.slice(0, 500) });
  }
});
