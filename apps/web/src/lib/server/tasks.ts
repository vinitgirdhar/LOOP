/**
 * Tasks are numbered per project (`unique (project_id, number)`) and the human
 * reference the UI shows is the project key plus that number — PAY-7. It is
 * derived rather than stored, so it is rebuilt here in one place instead of in
 * every handler that returns a task.
 */

export interface TaskWithKey extends Record<string, unknown> {
  key: string | null;
}

/**
 * Rows come back untyped.
 *
 * `TASK_SELECT` is assembled at runtime, and without generated database types
 * supabase-js cannot parse a non-literal select into a row type — it yields
 * `GenericStringError`. Accepting `unknown` states that plainly rather than
 * dressing up a cast as inference; the response envelope is the contract, and
 * `lib/api.ts` callers supply their own types on the way out.
 */
function keyFor(row: Record<string, unknown>): string | null {
  const project = row.project;
  const resolved = (Array.isArray(project) ? project[0] : project) as { key?: string | null } | null | undefined;
  const number = row.number;

  return resolved?.key && typeof number === 'number' ? `${resolved.key}-${number}` : null;
}

export function withKey(task: unknown): TaskWithKey {
  const row = (task ?? {}) as Record<string, unknown>;
  return { ...row, key: keyFor(row) };
}

export function withKeys(tasks: unknown): TaskWithKey[] {
  return Array.isArray(tasks) ? tasks.map(withKey) : [];
}

/** Columns every task read needs so `withKey` and the board can do their job. */
export const TASK_SELECT =
  'id, number, title, description, status, priority, story_points, estimate_hrs, due_date, start_date, completed_at, order, is_blocked, blocked_note, workspace_id, project_id, sprint_id, milestone_id, parent_id, assignee_id, reporter_id, last_activity_at, created_at, updated_at, ' +
  'project:projects (id, name, key), assignee:profiles!tasks_assignee_id_fkey (id, name, avatar_url, mascot), reporter:profiles!tasks_reporter_id_fkey (id, name, avatar_url, mascot)';
