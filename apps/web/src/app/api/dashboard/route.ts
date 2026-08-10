import { requireMember } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';
import { withKeys } from '@/lib/server/tasks';

/** Everything the workspace home screen shows, in one round trip. */
export const GET = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);
  const now = new Date().toISOString();

  const [myTasks, overdue, projects, activity, suggestions, running] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, number, title, status, priority, due_date, project_id, project:projects (id, name, key)')
      .eq('workspace_id', ws.workspaceId)
      .eq('assignee_id', user.id)
      .is('completed_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws.workspaceId)
      .eq('assignee_id', user.id)
      .is('completed_at', null)
      .lt('due_date', now),
    supabase
      .from('projects')
      .select('id, name, key, status, priority, deadline, color, updated_at')
      .eq('workspace_id', ws.workspaceId)
      .neq('status', 'ARCHIVED')
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('activity_log')
      .select('*, actor:profiles (id, name, avatar_url, mascot)')
      .eq('workspace_id', ws.workspaceId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('ai_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws.workspaceId)
      .eq('status', 'PENDING'),
    supabase
      .from('time_logs')
      .select('id, task_id, started_at, seconds, task:tasks (id, number, title, project:projects (id, key))')
      .eq('workspace_id', ws.workspaceId)
      .eq('user_id', user.id)
      .eq('is_running', true)
      .maybeSingle(),
  ]);

  return ok({
    myTasks: withKeys(myTasks.data ?? []),
    overdueCount: overdue.count ?? 0,
    projects: projects.data ?? [],
    activity: activity.data ?? [],
    pendingSuggestions: suggestions.count ?? 0,
    runningTimer: running.data ?? null,
  });
});
