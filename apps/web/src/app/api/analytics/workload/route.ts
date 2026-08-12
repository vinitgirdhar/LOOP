import { requireMember, requirePermission } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

interface MemberRow {
  user_id: string;
  role: string;
  capacity_hrs: number | null;
  user: { id: string; name: string; avatar_url: string | null; mascot: string | null } | null;
}

/**
 * Open work per person.
 *
 * Field names here are the ones the page reads — `openPoints` and `role`, not
 * `estimatedHrs`. The mismatch meant the workload bar chart was fed `undefined`
 * for every value and the story-points column was permanently blank.
 *
 * Members whose profile row has gone are dropped rather than returned with a
 * null `user`: the page indexes `row.user.id` for its React key, so a null
 * there is a crash rather than a gap.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.analytics.view');

  const [{ data: members }, { data: tasks }] = await Promise.all([
    ctx.supabase
      .from('workspace_members')
      .select('user_id, role, capacity_hrs, user:profiles (id, name, avatar_url, mascot)')
      .eq('workspace_id', ctx.ws.workspaceId),
    ctx.supabase
      .from('tasks')
      .select('assignee_id, completed_at, estimate_hrs, story_points, due_date')
      .eq('workspace_id', ctx.ws.workspaceId)
      .is('completed_at', null),
  ]);

  const now = Date.now();

  // Grouped in one pass; the per-member scan was quadratic on a busy workspace.
  const load = new Map<string, { open: number; hours: number; points: number; overdue: number }>();
  for (const task of (tasks ?? []) as { assignee_id: string | null; estimate_hrs: number | null; story_points: number | null; due_date: string | null }[]) {
    if (!task.assignee_id) continue;
    const entry = load.get(task.assignee_id) ?? { open: 0, hours: 0, points: 0, overdue: 0 };
    entry.open += 1;
    entry.hours += task.estimate_hrs ?? 0;
    entry.points += task.story_points ?? 0;
    if (task.due_date && Date.parse(task.due_date) < now) entry.overdue += 1;
    load.set(task.assignee_id, entry);
  }

  return ok(
    ((members ?? []) as unknown as MemberRow[])
      .filter((member) => member.user !== null)
      .map((member) => {
        const own = load.get(member.user_id) ?? { open: 0, hours: 0, points: 0, overdue: 0 };
        return {
          user: member.user,
          role: member.role,
          capacityHrs: member.capacity_hrs ?? 40,
          openTasks: own.open,
          openPoints: own.points,
          estimatedHrs: Math.round(own.hours * 10) / 10,
          overdue: own.overdue,
        };
      }),
  );
});
