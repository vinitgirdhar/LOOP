/**
 * Timeline maths, kept out of the component.
 *
 * All of this is pure: given rows and a scale it returns geometry. That is what
 * makes the drag interaction testable without a DOM — the component only has to
 * turn a pointer delta into a number of days and hand it back here.
 */

export const DAY_MS = 86_400_000;

export type Zoom = 'day' | 'week' | 'month';

/** Column width in pixels for one day, per zoom level. */
export const DAY_WIDTH: Record<Zoom, number> = { day: 38, week: 14, month: 4.6 };

export const ROW_HEIGHT = 34;
export const BAR_HEIGHT = 20;

export interface GanttTask {
  id: string;
  key: string | null;
  number: number;
  title: string;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isBlocked: boolean;
  parentId: string | null;
  sprintId: string | null;
  milestoneId: string | null;
  storyPoints: number | null;
  assignee: { id: string; name: string; avatarUrl: string | null; mascot?: string | null } | null;
}

export interface GanttDependency {
  blockerId: string;
  blockedId: string;
}

export interface GanttMilestone {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
}

export interface GanttSprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

/** Midnight UTC for a date, so a bar never shifts by an hour across a DST edge. */
export function startOfDay(value: Date | string | number): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export const addDays = (time: number, days: number) => time + days * DAY_MS;

export const daysBetween = (from: number, to: number) => Math.round((to - from) / DAY_MS);

/**
 * A task's bar, with the gaps filled in.
 *
 * Real boards are full of tasks with only one of the two dates set, and a
 * timeline that silently drops those shows a manager an empty chart and loses
 * their trust immediately. So a task with only a due date gets a one-day bar
 * ending on it, one with only a start date gets a one-day bar beginning there,
 * and one with neither is reported as unscheduled for the caller to list
 * separately rather than invent a position for.
 */
export function barFor(task: GanttTask): { start: number; end: number; inferred: boolean } | null {
  const start = task.startDate ? startOfDay(task.startDate) : null;
  const end = task.dueDate ? startOfDay(task.dueDate) : null;

  if (start !== null && end !== null) return { start, end: Math.max(end, start), inferred: false };
  if (end !== null) return { start: end, end, inferred: true };
  if (start !== null) return { start, end: start, inferred: true };
  return null;
}

/** The window the chart covers, padded so bars never touch the edges. */
export function timelineRange(tasks: GanttTask[], milestones: GanttMilestone[], sprints: GanttSprint[]) {
  const times: number[] = [];
  for (const task of tasks) {
    const bar = barFor(task);
    if (bar) times.push(bar.start, bar.end);
  }
  for (const milestone of milestones) if (milestone.dueDate) times.push(startOfDay(milestone.dueDate));
  for (const sprint of sprints) times.push(startOfDay(sprint.startDate), startOfDay(sprint.endDate));

  const today = startOfDay(Date.now());
  if (times.length === 0) return { from: addDays(today, -7), to: addDays(today, 21) };

  return { from: addDays(Math.min(...times), -3), to: addDays(Math.max(...times), 4) };
}

/**
 * Tasks that cannot slip without moving the project's end date.
 *
 * This is the standard forward/backward pass, not a heuristic: earliest finish
 * is propagated down the dependency graph, latest finish back up from the
 * project end, and anything with zero slack is on the critical path. Cycles are
 * survived by never revisiting a node in the same walk — `task_dependencies`
 * has no cycle constraint, so a bad edge must not hang the render.
 */
export function criticalPath(tasks: GanttTask[], dependencies: GanttDependency[]): Set<string> {
  const bars = new Map<string, { start: number; end: number }>();
  for (const task of tasks) {
    const bar = barFor(task);
    if (bar) bars.set(task.id, bar);
  }

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const edge of dependencies) {
    if (!bars.has(edge.blockerId) || !bars.has(edge.blockedId)) continue;
    successors.set(edge.blockerId, [...(successors.get(edge.blockerId) ?? []), edge.blockedId]);
    predecessors.set(edge.blockedId, [...(predecessors.get(edge.blockedId) ?? []), edge.blockerId]);
  }

  const earliestFinish = new Map<string, number>();
  const resolveEarliest = (id: string, seen: Set<string>): number => {
    const cached = earliestFinish.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return bars.get(id)!.end;
    seen.add(id);

    const bar = bars.get(id)!;
    const duration = bar.end - bar.start;
    const predecessorEnd = (predecessors.get(id) ?? []).reduce(
      (latest, parent) => Math.max(latest, resolveEarliest(parent, seen) + DAY_MS),
      bar.start,
    );
    const finish = predecessorEnd + duration;
    earliestFinish.set(id, finish);
    return finish;
  };
  for (const id of bars.keys()) resolveEarliest(id, new Set());

  const projectEnd = Math.max(...earliestFinish.values());

  const latestFinish = new Map<string, number>();
  const resolveLatest = (id: string, seen: Set<string>): number => {
    const cached = latestFinish.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return projectEnd;
    seen.add(id);

    const children = successors.get(id) ?? [];
    const value = children.length === 0
      ? projectEnd
      : children.reduce((earliest, child) => {
          const bar = bars.get(child)!;
          const duration = bar.end - bar.start;
          return Math.min(earliest, resolveLatest(child, seen) - duration - DAY_MS);
        }, Number.POSITIVE_INFINITY);

    latestFinish.set(id, value);
    return value;
  };
  for (const id of bars.keys()) resolveLatest(id, new Set());

  const critical = new Set<string>();
  for (const id of bars.keys()) {
    // Sub-day float is rounding, not slack.
    if (Math.abs((latestFinish.get(id) ?? 0) - (earliestFinish.get(id) ?? 0)) < DAY_MS) critical.add(id);
  }
  return critical;
}

/** Month bands across the header, so a long chart stays readable while scrolling. */
export function monthBands(from: number, to: number, dayWidth: number) {
  const bands: { label: string; x: number; width: number }[] = [];
  const cursor = new Date(from);
  cursor.setUTCDate(1);

  while (cursor.getTime() <= to) {
    const monthStart = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1);
    const monthEnd = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1);
    const visibleStart = Math.max(monthStart, from);
    const visibleEnd = Math.min(monthEnd, to + DAY_MS);

    if (visibleEnd > visibleStart) {
      bands.push({
        label: new Date(monthStart).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        x: daysBetween(from, visibleStart) * dayWidth,
        width: daysBetween(visibleStart, visibleEnd) * dayWidth,
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return bands;
}

export const isWeekend = (time: number) => {
  const day = new Date(time).getUTCDay();
  return day === 0 || day === 6;
};
