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

  const rows = withKeys(tasks.data ?? []);
  const ids = rows.map((task) => task.id as string);

  // Every card shows checklist progress, labels and comment/attachment counts.
  // Four narrow reads keyed by task id beat four per card.
  const [subtasks, comments, attachments, children] = ids.length
    ? await Promise.all([
        supabase.from('subtasks').select('task_id, done').in('task_id', ids),
        supabase.from('comments').select('task_id').in('task_id', ids),
        supabase.from('attachments').select('task_id').in('task_id', ids),
        supabase.from('tasks').select('parent_id').in('parent_id', ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const checklist = new Map<string, { done: number; total: number }>();
  for (const row of (subtasks.data ?? []) as { task_id: string; done: boolean }[]) {
    const entry = checklist.get(row.task_id) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (row.done) entry.done += 1;
    checklist.set(row.task_id, entry);
  }

  const tally = (source: unknown, key: 'task_id' | 'parent_id') => {
    const counts = new Map<string, number>();
    for (const row of (source ?? []) as Record<string, string | null>[]) {
      const id = row[key];
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  };

  const commentCount = tally(comments.data, 'task_id');
  const attachmentCount = tally(attachments.data, 'task_id');
  const childCount = tally(children.data, 'parent_id');

  return ok({
    columns: columns.data ?? [],
    tasks: rows.map((task) => {
      const id = task.id as string;
      const progress = checklist.get(id) ?? { done: 0, total: 0 };
      const subtaskCount = progress.total;
      return {
        ...task,
        checklistDone: progress.done,
        checklistTotal: progress.total,
        _count: {
          comments: commentCount.get(id) ?? 0,
          subtasks: subtaskCount,
          attachments: attachmentCount.get(id) ?? 0,
          children: childCount.get(id) ?? 0,
        },
      };
    }),
  });
});
