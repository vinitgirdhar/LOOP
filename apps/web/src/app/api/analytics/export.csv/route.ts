import { requireMember, requirePermission } from '@/lib/server/context';
import { fail } from '@/lib/server/http';

/** RFC 4180: quote every field and double any quote inside it. */
const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  try {
    const ctx = await requireMember(request);
    await requirePermission(ctx, ctx.ws, 'report.generate');

    const { data: tasks } = await ctx.supabase
      .from('tasks')
      .select('number, title, status, priority, story_points, estimate_hrs, due_date, completed_at, created_at, project:projects (key, name), assignee:profiles!tasks_assignee_id_fkey (name)')
      .eq('workspace_id', ctx.ws.workspaceId)
      .order('created_at', { ascending: false })
      .limit(5000);

    const header = ['Key', 'Project', 'Title', 'Status', 'Priority', 'Points', 'Estimate (hrs)', 'Assignee', 'Due', 'Completed', 'Created'];
    const rows = (tasks ?? []).map((task) => {
      const project = (Array.isArray(task.project) ? task.project[0] : task.project) as { key?: string; name?: string } | null;
      const assignee = (Array.isArray(task.assignee) ? task.assignee[0] : task.assignee) as { name?: string } | null;
      return [
        project?.key && task.number != null ? `${project.key}-${task.number}` : '',
        project?.name ?? '',
        task.title,
        task.status,
        task.priority,
        task.story_points ?? '',
        task.estimate_hrs ?? '',
        assignee?.name ?? '',
        task.due_date ?? '',
        task.completed_at ?? '',
        task.created_at,
      ].map(cell).join(',');
    });

    // The BOM is what makes Excel read the file as UTF-8 rather than mangling
    // any non-ASCII name in it.
    return new Response(`﻿${[header.map(cell).join(','), ...rows].join('\r\n')}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="loop-tasks-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
