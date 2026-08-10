import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';
import { TASK_SELECT, withKeys } from '@/lib/server/tasks';

type Params = { params: Promise<{ projectId: string }> };

/** Columns plus the tasks sitting in them, which is the whole Kanban payload. */
export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  const [columns, tasks] = await Promise.all([
    supabase.from('board_columns').select('*').eq('project_id', projectId).order('order', { ascending: true }),
    (() => {
      let query = supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('project_id', projectId)
        .eq('workspace_id', ws.workspaceId)
        .order('order', { ascending: true });

      const assignee = url.searchParams.get('assigneeId');
      const sprint = url.searchParams.get('sprintId');
      const priority = url.searchParams.get('priority');
      const search = url.searchParams.get('q');

      if (assignee) query = query.eq('assignee_id', assignee);
      if (sprint) query = query.eq('sprint_id', sprint);
      if (priority) query = query.eq('priority', priority);
      if (search) query = query.ilike('title', `%${search.replace(/[,()]/g, ' ')}%`);

      return query;
    })(),
  ]);

  assertOk(columns.error, 'Board');
  assertOk(tasks.error, 'Tasks');

  return ok({ columns: columns.data ?? [], tasks: withKeys(tasks.data ?? []) });
});
