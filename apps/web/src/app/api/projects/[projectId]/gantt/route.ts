import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

interface DependencyRow {
  blocker_id: string;
  blocked_id: string;
}

/**
 * Everything a timeline needs, in one round trip.
 *
 * A Gantt is the one view where fetching per row is indefensible: the arrows
 * are the point, and an arrow needs both ends resolved before the first paint.
 * So tasks, their dependency edges, the milestones they hang off and the sprint
 * bands behind them all arrive together.
 *
 * Dependencies are filtered to edges whose *both* ends are in this project.
 * `task_dependencies` is global, and a cross-project blocker would otherwise
 * arrive as an arrow pointing at a row the chart cannot draw.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase, ws } = await requireMember(request);

  const [tasks, milestones, sprints, project] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        'id, number, title, status, priority, start_date, due_date, completed_at, story_points, is_blocked, parent_id, sprint_id, milestone_id, assignee:profiles!tasks_assignee_id_fkey (id, name, avatar_url, mascot)',
      )
      .eq('project_id', projectId)
      .eq('workspace_id', ws.workspaceId)
      .order('start_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('milestones')
      .select('id, title, due_date, completed_at')
      .eq('project_id', projectId)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('sprints')
      .select('id, name, start_date, end_date, status')
      .eq('project_id', projectId)
      .order('start_date', { ascending: true }),
    supabase.from('projects').select('id, key, name, deadline, color').eq('id', projectId).single(),
  ]);

  assertOk(tasks.error, 'Tasks');
  assertOk(milestones.error, 'Milestones');
  assertOk(sprints.error, 'Sprints');
  assertOk(project.error, 'Project');

  const rows = (tasks.data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((task) => task.id as string);
  const inProject = new Set(ids);

  const { data: edges } = ids.length
    ? await supabase.from('task_dependencies').select('blocker_id, blocked_id').in('blocked_id', ids)
    : { data: [] as DependencyRow[] };

  const key = (project.data as { key?: string } | null)?.key ?? null;

  return ok({
    project: project.data,
    tasks: rows.map((task) => ({
      ...task,
      // The chart labels bars with the human reference (PAY-7), which is
      // derived from the project key rather than stored on the row.
      key: key && typeof task.number === 'number' ? `${key}-${task.number}` : null,
    })),
    dependencies: ((edges ?? []) as DependencyRow[]).filter((edge) => inProject.has(edge.blocker_id)),
    milestones: milestones.data ?? [],
    sprints: sprints.data ?? [],
  });
});
