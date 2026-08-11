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
      .select('id, number, title, due_date, completed_at, priority, project:projects (id, key, name)')
      .eq('workspace_id', ws.workspaceId)
      .not('due_date', 'is', null)
      .gte('due_date', from)
      .lte('due_date', to),
    supabase
      .from('milestones')
      .select('id, title, due_date, completed_at, project_id')
      .eq('workspace_id', ws.workspaceId)
      .not('due_date', 'is', null)
      .gte('due_date', from)
      .lte('due_date', to),
    supabase.from('holidays').select('*').eq('workspace_id', ws.workspaceId).gte('date', from.slice(0, 10)).lte('date', to.slice(0, 10)),
  ]);

  // The calendar renders one flat list it can sort and bucket by day, so the
  // four sources are normalised here rather than in the component.
  type Row = Record<string, unknown>;
  const events: {
    id: string;
    type: 'task' | 'meeting' | 'sprint' | 'holiday' | 'milestone';
    title: string;
    date: string;
    endDate?: string;
    done?: boolean;
    color: string;
    link: string | null;
  }[] = [];

  for (const row of (meetings.data ?? []) as Row[]) {
    events.push({
      id: `meeting-${row.id as string}`,
      type: 'meeting',
      title: row.title as string,
      date: row.starts_at as string,
      endDate: (row.ends_at as string | null) ?? undefined,
      color: '#6366f1',
      link: null,
    });
  }

  for (const row of (tasks.data ?? []) as Row[]) {
    const project = (Array.isArray(row.project) ? row.project[0] : row.project) as { key?: string } | null;
    events.push({
      id: `task-${row.id as string}`,
      type: 'task',
      title: project?.key ? `${project.key}-${row.number as number} ${row.title as string}` : (row.title as string),
      date: row.due_date as string,
      done: Boolean(row.completed_at),
      color: row.priority === 'URGENT' ? '#dc2626' : row.priority === 'HIGH' ? '#d97706' : '#0284c7',
      link: `/w/${ws.workspaceId}/tasks/${row.id as string}`,
    });
  }

  for (const row of (milestones.data ?? []) as Row[]) {
    events.push({
      id: `milestone-${row.id as string}`,
      type: 'milestone',
      title: row.title as string,
      date: row.due_date as string,
      done: Boolean(row.completed_at),
      color: '#059669',
      link: row.project_id ? `/w/${ws.workspaceId}/projects/${row.project_id as string}` : null,
    });
  }

  for (const row of (holidays.data ?? []) as Row[]) {
    events.push({
      id: `holiday-${row.id as string}`,
      type: 'holiday',
      title: (row.name as string) ?? 'Holiday',
      date: row.date as string,
      color: '#8b95a7',
      link: null,
    });
  }

  return ok(events.filter((event) => event.date).sort((a, b) => a.date.localeCompare(b.date)));
});
