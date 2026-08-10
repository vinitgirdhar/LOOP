import { requireMember } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/** Meetings, task due dates, milestones and holidays on one timeline. */
export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  const from = url.searchParams.get('from') ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  const to = url.searchParams.get('to') ?? new Date(Date.now() + 30 * 86_400_000).toISOString();

  const [meetings, tasks, milestones, holidays] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, starts_at, ends_at, location, project_id')
      .eq('workspace_id', ws.workspaceId)
      .gte('starts_at', from)
      .lte('starts_at', to),
    supabase
      .from('tasks')
      .select('id, number, title, due_date, priority, project:projects (id, key, name)')
      .eq('workspace_id', ws.workspaceId)
      .not('due_date', 'is', null)
      .gte('due_date', from)
      .lte('due_date', to),
    supabase
      .from('milestones')
      .select('id, title, due_date, project_id')
      .eq('workspace_id', ws.workspaceId)
      .not('due_date', 'is', null)
      .gte('due_date', from)
      .lte('due_date', to),
    supabase.from('holidays').select('*').eq('workspace_id', ws.workspaceId).gte('date', from.slice(0, 10)).lte('date', to.slice(0, 10)),
  ]);

  return ok({
    meetings: meetings.data ?? [],
    tasks: tasks.data ?? [],
    milestones: milestones.data ?? [],
    holidays: holidays.data ?? [],
  });
});
