import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

/**
 * Story points actually completed per closed sprint, which is what makes the
 * next sprint's capacity a forecast rather than a guess.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data: sprints, error } = await supabase
    .from('sprints')
    .select('id, name, capacity, start_date, end_date')
    .eq('project_id', projectId)
    .eq('workspace_id', ws.workspaceId)
    .eq('status', 'COMPLETED')
    .order('end_date', { ascending: true })
    .limit(12);

  assertOk(error, 'Sprints');

  const { data: tasks } = await supabase
    .from('tasks')
    .select('sprint_id, story_points, completed_at')
    .eq('project_id', projectId)
    .in('sprint_id', (sprints ?? []).map((sprint) => sprint.id));

  const completedBySprint = new Map<string, number>();
  for (const task of tasks ?? []) {
    if (!task.completed_at || !task.sprint_id) continue;
    completedBySprint.set(task.sprint_id, (completedBySprint.get(task.sprint_id) ?? 0) + (task.story_points ?? 0));
  }

  return ok(
    (sprints ?? []).map((sprint) => ({
      sprintId: sprint.id,
      name: sprint.name,
      committed: sprint.capacity ?? 0,
      completed: completedBySprint.get(sprint.id) ?? 0,
      endDate: sprint.end_date,
    })),
  );
});
