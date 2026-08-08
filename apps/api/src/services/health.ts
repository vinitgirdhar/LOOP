import { prisma } from '@loop/db';
import { HEALTH_SIGNALS, SILENT_TASK_DAYS, WIP_LIMIT_PER_PERSON } from '@loop/shared';
import { complete } from './ai.js';
import { logger } from '../lib/logger.js';
import { features } from '../env.js';

/**
 * Explainable Project Health Score.
 *
 * The number is pure arithmetic — no model is involved in producing it, so it
 * cannot be hallucinated. Each signal reports its own penalty (0..1), its
 * weight and the exact contribution it made, plus a human sentence explaining
 * where the penalty came from. AI is only allowed to write the narrative
 * paragraph on top of the finished numbers.
 */

export interface HealthSignal {
  key: string;
  label: string;
  weight: number;
  /** 0 = perfect, 1 = worst case */
  penalty: number;
  /** points removed from 100 by this signal */
  contribution: number;
  detail: string;
  value: string;
}

export interface HealthAction {
  label: string;
  gain: number;
  signal: string;
}

export interface HealthResult {
  projectId: string;
  score: number;
  signals: HealthSignal[];
  actions: HealthAction[];
  narrative: string | null;
  computedAt: string;
  sampleSize: { openTasks: number; totalTasks: number };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** penalty reaches 1.0 once the ratio hits `worstAt`. */
const ratioPenalty = (ratio: number, worstAt: number) => clamp01(ratio / worstAt);

export async function computeHealth(
  projectId: string,
  options: { persist?: boolean; narrate?: boolean } = {},
): Promise<HealthResult> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, name: true, workspaceId: true, deadline: true, columns: { select: { key: true, isDone: true } } },
  });

  const doneKeys = project.columns.filter((c) => c.isDone).map((c) => c.key);
  const now = new Date();
  const silentCutoff = new Date(now.getTime() - SILENT_TASK_DAYS * 86_400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86_400_000);

  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      completedAt: true,
      isBlocked: true,
      assigneeId: true,
      storyPoints: true,
      lastActivityAt: true,
      blockedBy: { select: { blocker: { select: { completedAt: true } } } },
    },
  });

  const open = tasks.filter((t) => !t.completedAt && !doneKeys.includes(t.status));
  const openCount = open.length || 1; // guard against divide-by-zero, reported honestly below

  // 1 ─ overdue ratio
  const overdue = open.filter((t) => t.dueDate && t.dueDate < now);
  const overdueRatio = open.length === 0 ? 0 : overdue.length / openCount;
  const overduePenalty = ratioPenalty(overdueRatio, 0.4);

  // 2 ─ blocked dependency chains
  const blocked = open.filter((t) => t.isBlocked || t.blockedBy.some((d) => !d.blocker.completedAt));
  const blockedRatio = open.length === 0 ? 0 : blocked.length / openCount;
  const blockedPenalty = ratioPenalty(blockedRatio, 0.25);

  // 3 ─ velocity trend (last 14 days vs the 14 before that)
  const recentPts = tasks
    .filter((t) => t.completedAt && t.completedAt >= twoWeeksAgo)
    .reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const priorPts = tasks
    .filter((t) => t.completedAt && t.completedAt >= fourWeeksAgo && t.completedAt < twoWeeksAgo)
    .reduce((sum, t) => sum + (t.storyPoints ?? 1), 0);
  const hasVelocityHistory = priorPts > 0;
  const trend = hasVelocityHistory ? recentPts / priorPts : 1;
  const velocityPenalty = hasVelocityHistory ? clamp01(1 - trend) : 0;

  // 4 ─ WIP overload per person
  const wipByUser = new Map<string, number>();
  for (const t of open) {
    if (!t.assigneeId || doneKeys.includes(t.status) || t.status === 'backlog') continue;
    wipByUser.set(t.assigneeId, (wipByUser.get(t.assigneeId) ?? 0) + 1);
  }
  const assignees = [...wipByUser.keys()];
  const overloaded = assignees.filter((id) => (wipByUser.get(id) ?? 0) > WIP_LIMIT_PER_PERSON);
  const wipPenalty = assignees.length === 0 ? 0 : overloaded.length / assignees.length;

  // 5 ─ silent tasks (no activity for N days)
  const silent = open.filter((t) => t.lastActivityAt < silentCutoff);
  const silentRatio = open.length === 0 ? 0 : silent.length / openCount;
  const silentPenalty = ratioPenalty(silentRatio, 0.5);

  const weight = (key: string) => HEALTH_SIGNALS.find((s) => s.key === key)!.weight;
  const label = (key: string) => HEALTH_SIGNALS.find((s) => s.key === key)!.label;

  const build = (key: string, penalty: number, value: string, detail: string): HealthSignal => ({
    key,
    label: label(key),
    weight: weight(key),
    penalty: Number(penalty.toFixed(3)),
    contribution: Number((penalty * weight(key)).toFixed(1)),
    value,
    detail,
  });

  const signals: HealthSignal[] = [
    build(
      'overdue',
      overduePenalty,
      `${overdue.length}/${open.length}`,
      open.length === 0
        ? 'No open tasks.'
        : `${overdue.length} of ${open.length} open tasks are past their due date (${pct(overdueRatio)}). Full penalty at 40%.`,
    ),
    build(
      'blocked',
      blockedPenalty,
      `${blocked.length}/${open.length}`,
      open.length === 0
        ? 'No open tasks.'
        : `${blocked.length} open tasks are flagged blocked or wait on an unfinished dependency (${pct(blockedRatio)}). Full penalty at 25%.`,
    ),
    build(
      'velocity',
      velocityPenalty,
      hasVelocityHistory ? `${recentPts} vs ${priorPts} pts` : 'no history',
      hasVelocityHistory
        ? `${recentPts} points closed in the last 14 days against ${priorPts} in the 14 before (${Math.round(trend * 100)}% of previous).`
        : 'Not enough completed work yet to measure a trend, so this signal takes no points off.',
    ),
    build(
      'wip',
      wipPenalty,
      `${overloaded.length}/${assignees.length}`,
      assignees.length === 0
        ? 'Nothing assigned yet.'
        : `${overloaded.length} of ${assignees.length} people carry more than ${WIP_LIMIT_PER_PERSON} tasks in flight.`,
    ),
    build(
      'silent',
      silentPenalty,
      `${silent.length}/${open.length}`,
      open.length === 0
        ? 'No open tasks.'
        : `${silent.length} open tasks have had no activity for ${SILENT_TASK_DAYS}+ days (${pct(silentRatio)}). Full penalty at 50%.`,
    ),
  ];

  const score = Math.max(0, Math.round(100 - signals.reduce((sum, s) => sum + s.contribution, 0)));

  const actionFor = (signal: HealthSignal): HealthAction | null => {
    if (signal.contribution < 1) return null;
    const gain = Math.round(signal.contribution);
    switch (signal.key) {
      case 'overdue':
        return { label: `Re-date or close the ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`, gain, signal: signal.key };
      case 'blocked':
        return { label: `Unblock ${blocked.length} task${blocked.length === 1 ? '' : 's'} — start with the oldest dependency chain`, gain, signal: signal.key };
      case 'velocity':
        return { label: 'Velocity dropped — cut sprint scope or clear whatever slowed the team down', gain, signal: signal.key };
      case 'wip':
        return { label: `Rebalance work: ${overloaded.length} person(s) hold more than ${WIP_LIMIT_PER_PERSON} tasks at once`, gain, signal: signal.key };
      case 'silent':
        return { label: `Chase or close ${silent.length} task${silent.length === 1 ? '' : 's'} with no activity for ${SILENT_TASK_DAYS}+ days`, gain, signal: signal.key };
      default:
        return null;
    }
  };

  const actions = signals
    .slice()
    .sort((a, b) => b.contribution - a.contribution)
    .map(actionFor)
    .filter((a): a is HealthAction => a !== null)
    .slice(0, 3);

  let narrative: string | null = null;
  if (options.narrate && features.ai && open.length > 0) {
    narrative = await narrate(project.name, score, signals, actions);
  }

  const result: HealthResult = {
    projectId,
    score,
    signals,
    actions,
    narrative,
    computedAt: now.toISOString(),
    sampleSize: { openTasks: open.length, totalTasks: tasks.length },
  };

  if (options.persist) {
    await prisma.healthSnapshot.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        score,
        signals: signals as never,
        actions: actions as never,
        narrative,
      },
    });
  }

  return result;
}

/**
 * The model is handed the finished numbers and told explicitly not to invent
 * new ones. It can only rephrase what the arithmetic already decided.
 */
async function narrate(
  projectName: string,
  score: number,
  signals: HealthSignal[],
  actions: HealthAction[],
): Promise<string | null> {
  try {
    const { text } = await complete({
      system:
        'You explain a project health score to a manager. You are given the final numbers — never invent, recompute or contradict them. ' +
        'Write 2 to 3 short sentences of plain English. No bullet points, no markdown, no headings.',
      prompt: [
        `Project: ${projectName}`,
        `Score: ${score}/100 (100 is healthy)`,
        'Signals:',
        ...signals.map((s) => `- ${s.label}: ${s.value}, took off ${s.contribution} of ${s.weight} points. ${s.detail}`),
        actions.length ? `Recommended fixes: ${actions.map((a) => a.label).join('; ')}` : 'No fixes needed.',
      ].join('\n'),
      temperature: 0.3,
      maxTokens: 220,
    });
    return text;
  } catch (error: unknown) {
    logger.warn('health narrative failed', error instanceof Error ? error.message : error);
    return null;
  }
}
