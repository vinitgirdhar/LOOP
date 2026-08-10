import type { SupabaseClient } from '@supabase/supabase-js';
import { HEALTH_SIGNALS, SILENT_TASK_DAYS, WIP_LIMIT_PER_PERSON } from '@loop/shared';

/**
 * The explainable project health score.
 *
 * Every project starts at 100 and each signal subtracts a share of its own
 * weight — the weights sum to 100, so the arithmetic is visible rather than
 * fitted. The point of the feature is that a number can be argued with, so each
 * signal carries the value it measured and the exact points it cost.
 */

export interface HealthSignal {
  key: string;
  label: string;
  weight: number;
  value: number;
  contribution: number;
  detail: string;
}

export interface HealthResult {
  score: number;
  signals: HealthSignal[];
  narrative: string;
  actions: { label: string; gain: number; signal: string }[];
}

interface TaskRow {
  id: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  is_blocked: boolean;
  assignee_id: string | null;
  story_points: number | null;
  last_activity_at: string;
}

const weightOf = (key: string) => HEALTH_SIGNALS.find((signal) => signal.key === key)?.weight ?? 0;
const labelOf = (key: string) => HEALTH_SIGNALS.find((signal) => signal.key === key)?.label ?? key;
const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);
const round = (value: number) => Math.round(value * 10) / 10;

export async function computeHealth(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
): Promise<HealthResult> {
  const now = Date.now();
  const silentBefore = new Date(now - SILENT_TASK_DAYS * 86_400_000).toISOString();

  const [{ data: tasks }, { data: doneColumns }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, status, due_date, completed_at, is_blocked, assignee_id, story_points, last_activity_at')
      .eq('project_id', projectId)
      .eq('workspace_id', workspaceId),
    supabase.from('board_columns').select('key').eq('project_id', projectId).eq('is_done', true),
  ]);

  const doneKeys = new Set((doneColumns ?? []).map((column) => column.key));
  const all = (tasks ?? []) as TaskRow[];
  const open = all.filter((task) => !task.completed_at && !doneKeys.has(task.status));

  // ── overdue ───────────────────────────────────────────────────────────────
  const overdue = open.filter((task) => task.due_date !== null && Date.parse(task.due_date) < now);
  const overdueRatio = ratio(overdue.length, open.length);

  // ── blocked ───────────────────────────────────────────────────────────────
  const blocked = open.filter((task) => task.is_blocked);
  const blockedRatio = ratio(blocked.length, open.length);

  // ── velocity ──────────────────────────────────────────────────────────────
  // Completion over the last fortnight against the fortnight before it. A
  // project that has simply finished is not unhealthy, so an empty board scores
  // clean rather than zero.
  const twoWeeks = 14 * 86_400_000;
  const recent = all.filter((task) => task.completed_at && now - Date.parse(task.completed_at) <= twoWeeks).length;
  const previous = all.filter((task) => {
    if (!task.completed_at) return false;
    const age = now - Date.parse(task.completed_at);
    return age > twoWeeks && age <= twoWeeks * 2;
  }).length;

  const velocityDrop = previous === 0 ? 0 : Math.max(0, Math.min(1, (previous - recent) / previous));

  // ── work in progress ──────────────────────────────────────────────────────
  const perPerson = new Map<string, number>();
  for (const task of open) {
    if (!task.assignee_id) continue;
    perPerson.set(task.assignee_id, (perPerson.get(task.assignee_id) ?? 0) + 1);
  }
  const overloaded = [...perPerson.values()].filter((count) => count > WIP_LIMIT_PER_PERSON).length;
  const wipRatio = ratio(overloaded, Math.max(1, perPerson.size));

  // ── silent tasks ──────────────────────────────────────────────────────────
  const silent = open.filter((task) => task.last_activity_at < silentBefore);
  const silentRatio = ratio(silent.length, open.length);

  const measured: { key: string; value: number; detail: string }[] = [
    {
      key: 'overdue',
      value: overdueRatio,
      detail: `${overdue.length} of ${open.length} open tasks are past their due date.`,
    },
    {
      key: 'blocked',
      value: blockedRatio,
      detail: `${blocked.length} open ${blocked.length === 1 ? 'task is' : 'tasks are'} flagged as blocked.`,
    },
    {
      key: 'velocity',
      value: velocityDrop,
      detail:
        previous === 0
          ? 'Not enough history yet to compare completion rates.'
          : `${recent} tasks finished in the last two weeks against ${previous} in the two before.`,
    },
    {
      key: 'wip',
      value: wipRatio,
      detail: `${overloaded} of ${perPerson.size || 0} people are carrying more than ${WIP_LIMIT_PER_PERSON} open tasks.`,
    },
    {
      key: 'silent',
      value: silentRatio,
      detail: `${silent.length} open ${silent.length === 1 ? 'task has' : 'tasks have'} had no activity for ${SILENT_TASK_DAYS} days.`,
    },
  ];

  const signals: HealthSignal[] = measured.map((signal) => {
    const weight = weightOf(signal.key);
    return {
      key: signal.key,
      label: labelOf(signal.key),
      weight,
      value: round(signal.value * 100),
      contribution: round(signal.value * weight),
      detail: signal.detail,
    };
  });

  const lost = signals.reduce((sum, signal) => sum + signal.contribution, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - lost)));

  // The biggest losses are the only ones worth suggesting an action for.
  const actions = signals
    .filter((signal) => signal.contribution >= 1)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((signal) => ({
      signal: signal.key,
      gain: Math.round(signal.contribution),
      label:
        signal.key === 'overdue'
          ? `Re-date or close the ${overdue.length} overdue ${overdue.length === 1 ? 'task' : 'tasks'}`
          : signal.key === 'blocked'
            ? `Clear the ${blocked.length} blocked ${blocked.length === 1 ? 'task' : 'tasks'}`
            : signal.key === 'velocity'
              ? 'Check whether scope grew or the team lost capacity'
              : signal.key === 'wip'
                ? `Rebalance work away from the ${overloaded} overloaded ${overloaded === 1 ? 'person' : 'people'}`
                : `Update or close the ${silent.length} silent ${silent.length === 1 ? 'task' : 'tasks'}`,
    }));

  const worst = [...signals].sort((a, b) => b.contribution - a.contribution)[0];
  const narrative =
    open.length === 0
      ? 'No open tasks, so there is nothing dragging this project down.'
      : lost < 5
        ? 'Nothing significant is pulling this project off track.'
        : `Most of the ${Math.round(lost)} points lost come from ${worst.label.toLowerCase()}. ${worst.detail}`;

  return { score, signals, narrative, actions };
}

/** Keeps one snapshot per project per day so the trend chart has a clean series. */
export async function persistHealth(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
  result: HealthResult,
): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: today } = await supabase
    .from('health_snapshots')
    .select('id')
    .eq('project_id', projectId)
    .gte('created_at', startOfDay.toISOString())
    .maybeSingle();

  const row = {
    workspace_id: workspaceId,
    project_id: projectId,
    score: result.score,
    signals: result.signals,
    narrative: result.narrative,
    actions: result.actions,
  };

  // A failure here must not fail the read — the caller already has its answer.
  if (today) await supabase.from('health_snapshots').update(row).eq('id', today.id);
  else await supabase.from('health_snapshots').insert(row);
}
