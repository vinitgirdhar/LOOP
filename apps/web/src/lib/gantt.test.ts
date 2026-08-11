import assert from 'node:assert/strict';
import { DAY_MS, barFor, criticalPath, daysBetween, startOfDay, timelineRange, type GanttTask } from './gantt';

/*
  Run with `npm test`.

  The geometry is pure, so it is checkable without a browser — which is the
  whole reason it does not live inside the component. The drag handler only
  converts pixels to days; everything that decides where a bar actually goes is
  exercised here.
*/

const day = (iso: string) => `${iso}T00:00:00.000Z`;

function task(id: string, start: string | null, due: string | null): GanttTask {
  return {
    id,
    key: `T-${id}`,
    number: Number(id),
    title: `Task ${id}`,
    status: 'backlog',
    priority: 'MEDIUM',
    startDate: start ? day(start) : null,
    dueDate: due ? day(due) : null,
    completedAt: null,
    isBlocked: false,
    parentId: null,
    sprintId: null,
    milestoneId: null,
    storyPoints: null,
    assignee: null,
  };
}

// ── barFor ────────────────────────────────────────────────────────────────
{
  const both = barFor(task('1', '2026-01-05', '2026-01-09'))!;
  assert.equal(daysBetween(both.start, both.end), 4, 'a four-day span measures four days');
  assert.equal(both.inferred, false);

  const dueOnly = barFor(task('2', null, '2026-01-09'))!;
  assert.equal(dueOnly.start, dueOnly.end, 'a due date alone yields a single-day bar');
  assert.equal(dueOnly.inferred, true, 'and is flagged so the UI can draw it faded');

  const startOnly = barFor(task('3', '2026-01-05', null))!;
  assert.equal(startOnly.inferred, true);

  assert.equal(barFor(task('4', null, null)), null, 'a task with no dates has no bar at all');

  // A due date before the start date must not produce a negative-width bar.
  const inverted = barFor(task('5', '2026-01-09', '2026-01-05'))!;
  assert.ok(inverted.end >= inverted.start, 'an inverted range is clamped, never drawn backwards');
}

// ── timelineRange ─────────────────────────────────────────────────────────
{
  const range = timelineRange([task('1', '2026-01-05', '2026-01-09')], [], []);
  assert.ok(range.from < startOfDay(day('2026-01-05')), 'the window pads before the first bar');
  assert.ok(range.to > startOfDay(day('2026-01-09')), 'and after the last');

  const empty = timelineRange([], [], []);
  assert.ok(empty.to > empty.from, 'an empty project still gets a usable window around today');
}

// ── criticalPath ──────────────────────────────────────────────────────────
{
  // A → B is the long chain; C is a short independent task with slack.
  const a = task('1', '2026-01-01', '2026-01-05');
  const b = task('2', '2026-01-06', '2026-01-10');
  const c = task('3', '2026-01-01', '2026-01-02');
  const critical = criticalPath([a, b, c], [{ blockerId: a.id, blockedId: b.id }]);

  assert.ok(critical.has(a.id), 'the blocker of the longest chain is critical');
  assert.ok(critical.has(b.id), 'so is the task it blocks');
  assert.ok(!critical.has(c.id), 'a short independent task has slack and is not');
}

{
  // task_dependencies has no cycle constraint, so a bad edge must not hang.
  const a = task('1', '2026-01-01', '2026-01-03');
  const b = task('2', '2026-01-04', '2026-01-06');
  const result = criticalPath([a, b], [
    { blockerId: a.id, blockedId: b.id },
    { blockerId: b.id, blockedId: a.id },
  ]);
  assert.ok(result instanceof Set, 'a dependency cycle terminates instead of recursing forever');
}

{
  // An edge pointing at a task with no dates must be ignored, not crash.
  const a = task('1', '2026-01-01', '2026-01-03');
  const ghost = task('9', null, null);
  const result = criticalPath([a, ghost], [{ blockerId: a.id, blockedId: ghost.id }]);
  assert.ok(!result.has(ghost.id), 'an unscheduled task is never on the critical path');
}

// ── startOfDay ────────────────────────────────────────────────────────────
{
  const noon = startOfDay('2026-03-29T12:34:56.000Z');
  const midnight = startOfDay('2026-03-29T00:00:00.000Z');
  assert.equal(noon, midnight, 'times within a day collapse to the same column');
  assert.equal(daysBetween(midnight, midnight + DAY_MS), 1);
}

console.log('gantt: all checks passed');
