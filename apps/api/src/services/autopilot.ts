import { z } from 'zod';
import { prisma, type SuggestionKind } from '@loop/db';
import { SOCKET_EVENTS } from '@loop/shared';
import { completeJson } from './ai.js';
import { features } from '../env.js';
import { logger } from '../lib/logger.js';
import { emitTo, roomProject, roomWorkspace } from '../realtime/io.js';
import { applyTaskUpdate } from './taskWrite.js';
import { activity, audit } from './audit.js';

/**
 * Auto-Pilot board.
 *
 * Rules run first and are deterministic; the model is only asked to break ties
 * the rules cannot (which task did "the payment API" mean?). Nothing ever
 * writes to a task directly — every outcome is an AiSuggestion row that a
 * human accepts or rejects, unless the project owner explicitly turned on
 * auto-apply and the confidence clears the bar.
 */

export const AUTO_APPLY_THRESHOLD = 0.9;

export interface Evidence {
  type: 'commit' | 'pull_request' | 'message' | 'comment' | 'rule';
  label: string;
  url?: string | null;
  quote?: string;
}

interface CreateSuggestion {
  workspaceId: string;
  projectId: string;
  taskId?: string | null;
  kind: SuggestionKind;
  title: string;
  rationale: string;
  evidence: Evidence[];
  confidence: number;
  proposedChange: Record<string, unknown>;
  source: 'rules' | 'ai';
}

const BLOCKED_PATTERNS = [
  /\bi'?m\s+stuck\b/i,
  /\bstuck\s+on\b/i,
  /\bblocked\s+(?:on|by)\b/i,
  /\bcan'?t\s+(?:proceed|continue|move\s+forward)\b/i,
  /\bwaiting\s+on\b/i,
  /\bneed\s+help\s+with\b/i,
];

const UNBLOCK_PATTERNS = [/\bunblocked\b/i, /\bfixed\s+it\b/i, /\bsorted\b/i, /\bresolved\b/i];

const DONE_PATTERNS = [/\b(?:finished|done\s+with|completed|shipped)\b/i];

/** Matches KEY-123 anywhere in free text. */
const TASK_KEY_RE = /\b([A-Z][A-Z0-9]{1,7})-(\d{1,6})\b/g;

async function resolveTaskKeys(workspaceId: string, text: string) {
  const matches = [...text.matchAll(TASK_KEY_RE)];
  if (matches.length === 0) return [];
  const found = await Promise.all(
    matches.map(([, key, number]) =>
      prisma.task.findFirst({
        where: { workspaceId, number: Number(number), project: { key: key! } },
        include: { project: { select: { id: true, key: true, autoApply: true, columns: { orderBy: { order: 'asc' } } } } },
      }),
    ),
  );
  return found.filter((t): t is NonNullable<typeof t> => t !== null);
}

export async function createSuggestion(input: CreateSuggestion) {
  const existing = await prisma.aiSuggestion.findFirst({
    where: {
      workspaceId: input.workspaceId,
      taskId: input.taskId ?? undefined,
      kind: input.kind,
      status: 'PENDING',
      createdAt: { gt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    },
  });
  if (existing) return existing; // do not spam the inbox with the same idea

  const suggestion = await prisma.aiSuggestion.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      kind: input.kind,
      title: input.title,
      rationale: input.rationale,
      evidence: input.evidence as never,
      confidence: input.confidence,
      proposedChange: input.proposedChange as never,
      source: input.source,
    },
    include: { task: { select: { id: true, number: true, title: true, project: { select: { key: true } } } } },
  });

  emitTo(roomWorkspace(input.workspaceId), SOCKET_EVENTS.suggestionNew, suggestion);
  emitTo(roomProject(input.projectId), SOCKET_EVENTS.suggestionNew, suggestion);

  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { autoApply: true } });
  if (project?.autoApply && input.confidence >= AUTO_APPLY_THRESHOLD) {
    await decideSuggestion(suggestion.id, 'AUTO_APPLIED', null, 'Auto-Pilot (auto-apply is on for this project)');
  }
  return suggestion;
}

// ───────────────────────── chat / comment rules ─────────────────────────

export interface ChatRuleInput {
  workspaceId: string;
  projectId?: string | null;
  authorName: string;
  text: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  hintTaskId?: string | null;
}

export async function runChatRules(input: ChatRuleInput): Promise<void> {
  try {
    const isBlocked = BLOCKED_PATTERNS.some((re) => re.test(input.text));
    const isUnblocked = UNBLOCK_PATTERNS.some((re) => re.test(input.text));
    const isDone = DONE_PATTERNS.some((re) => re.test(input.text));
    if (!isBlocked && !isUnblocked && !isDone) return;

    const keyed = await resolveTaskKeys(input.workspaceId, input.text);
    const evidence: Evidence[] = [
      { type: 'message', label: input.sourceLabel, url: input.sourceUrl ?? null, quote: input.text.slice(0, 240) },
    ];

    // Rule path: the message named the task explicitly.
    if (keyed.length > 0) {
      for (const task of keyed) {
        if (isBlocked && !task.isBlocked) {
          await createSuggestion({
            workspaceId: input.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            kind: 'FLAG_BLOCKED',
            title: `Flag ${task.project.key}-${task.number} as blocked`,
            rationale: `${input.authorName} said they are stuck and named ${task.project.key}-${task.number} in ${input.sourceLabel}.`,
            evidence,
            confidence: 0.92,
            proposedChange: { isBlocked: true, blockedNote: input.text.slice(0, 200) },
            source: 'rules',
          });
        }
        if (isUnblocked && task.isBlocked) {
          await createSuggestion({
            workspaceId: input.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            kind: 'FLAG_BLOCKED',
            title: `Clear the blocked flag on ${task.project.key}-${task.number}`,
            rationale: `${input.authorName} reported the blocker is gone in ${input.sourceLabel}.`,
            evidence,
            confidence: 0.85,
            proposedChange: { isBlocked: false, blockedNote: null },
            source: 'rules',
          });
        }
      }
      return;
    }

    // AI path: a blocker was described but no task key was given.
    if (!isBlocked || !features.ai) return;
    const projectId = input.projectId ?? null;
    if (!projectId) return;

    const candidates = await prisma.task.findMany({
      where: { projectId, completedAt: null, isBlocked: false },
      orderBy: { lastActivityAt: 'desc' },
      take: 15,
      include: { project: { select: { key: true } } },
    });
    if (candidates.length === 0) return;

    const schema = z.object({
      taskNumber: z.number().int().nullable(),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(300),
    });

    const { data } = await completeJson(schema, {
      system:
        'You map a chat message about being blocked onto the single task it most likely refers to. ' +
        'Answer with JSON: {"taskNumber": number|null, "confidence": 0..1, "reason": string}. ' +
        'Return null when no task is a clear match. Never guess — a low confidence is better than a wrong task.',
      prompt: [
        `Message from ${input.authorName}: "${input.text}"`,
        'Open tasks:',
        ...candidates.map((t) => `${t.project.key}-${t.number}: ${t.title}${t.description ? ` — ${t.description.slice(0, 120)}` : ''}`),
      ].join('\n'),
      temperature: 0.1,
      maxTokens: 200,
    });

    if (data.taskNumber === null || data.confidence < 0.55) return;
    const task = candidates.find((t) => t.number === data.taskNumber);
    if (!task) return;

    await createSuggestion({
      workspaceId: input.workspaceId,
      projectId,
      taskId: task.id,
      kind: 'FLAG_BLOCKED',
      title: `Flag ${task.project.key}-${task.number} as blocked`,
      rationale: data.reason,
      evidence,
      // AI-matched suggestions are capped below the auto-apply threshold on purpose.
      confidence: Math.min(0.85, data.confidence),
      proposedChange: { isBlocked: true, blockedNote: input.text.slice(0, 200) },
      source: 'ai',
    });
  } catch (error: unknown) {
    logger.warn('autopilot chat rules failed', error instanceof Error ? error.message : error);
  }
}

// ───────────────────────── GitHub rules ─────────────────────────

export interface GithubSignal {
  workspaceId: string;
  repo: string;
  kind: 'push' | 'pull_request_opened' | 'pull_request_merged' | 'branch_created';
  reference: string; // branch name, commit message or PR title
  url: string | null;
  actor: string;
}

/** Which column a GitHub event implies. Deterministic — no model involved. */
function targetColumn(kind: GithubSignal['kind']): { key: string; label: string; confidence: number } | null {
  switch (kind) {
    case 'branch_created':
      return { key: 'in_progress', label: 'In Progress', confidence: 0.88 };
    case 'push':
      return { key: 'in_progress', label: 'In Progress', confidence: 0.8 };
    case 'pull_request_opened':
      return { key: 'code_review', label: 'Code Review', confidence: 0.94 };
    case 'pull_request_merged':
      return { key: 'testing', label: 'Testing', confidence: 0.9 };
    default:
      return null;
  }
}

export async function runGithubRules(signal: GithubSignal): Promise<number> {
  const tasks = await resolveTaskKeys(signal.workspaceId, signal.reference.toUpperCase());
  if (tasks.length === 0) return 0;

  const target = targetColumn(signal.kind);
  if (!target) return 0;

  let made = 0;
  for (const task of tasks) {
    const column =
      task.project.columns.find((c) => c.key === target.key) ??
      task.project.columns.find((c) => c.name.toLowerCase() === target.label.toLowerCase());
    if (!column || task.status === column.key) continue;

    await activity({
      workspaceId: signal.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      type: `github.${signal.kind}`,
      message: `${signal.actor} — ${signal.reference} (${signal.repo})`,
      meta: { repo: signal.repo, url: signal.url },
    });

    await createSuggestion({
      workspaceId: signal.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      kind: 'MOVE_STATUS',
      title: `Move ${task.project.key}-${task.number} to ${column.name}`,
      rationale: `${signal.kind.replace(/_/g, ' ')} on ${signal.repo} referenced ${task.project.key}-${task.number}.`,
      evidence: [
        {
          type: signal.kind.startsWith('pull_request') ? 'pull_request' : 'commit',
          label: `${signal.repo}: ${signal.reference}`.slice(0, 160),
          url: signal.url,
          quote: signal.reference.slice(0, 240),
        },
      ],
      confidence: target.confidence,
      proposedChange: { status: column.key },
      source: 'rules',
    });
    made += 1;
  }
  return made;
}

// ───────────────────────── accept / reject ─────────────────────────

export async function decideSuggestion(
  suggestionId: string,
  decision: 'ACCEPTED' | 'REJECTED' | 'AUTO_APPLIED',
  userId: string | null,
  actorName: string,
) {
  const suggestion = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
  if (suggestion.status !== 'PENDING') return suggestion;

  if (decision !== 'REJECTED' && suggestion.taskId) {
    const task = await prisma.task.findUnique({ where: { id: suggestion.taskId } });
    if (task) {
      await applyTaskUpdate(task, suggestion.proposedChange as never, {
        workspaceId: suggestion.workspaceId,
        actorId: userId,
        actorName: `${actorName} (via Auto-Pilot)`,
      });
    }
  }

  const updated = await prisma.aiSuggestion.update({
    where: { id: suggestionId },
    data: { status: decision, decidedById: userId, decidedAt: new Date() },
  });

  await audit({
    workspaceId: suggestion.workspaceId,
    actorId: userId,
    action: `suggestion.${decision.toLowerCase()}`,
    entity: 'ai_suggestion',
    entityId: suggestionId,
    meta: {
      kind: suggestion.kind,
      taskId: suggestion.taskId,
      confidence: suggestion.confidence,
      change: suggestion.proposedChange,
      evidence: suggestion.evidence,
    },
  });

  emitTo(roomWorkspace(suggestion.workspaceId), 'suggestion:decided', updated);
  return updated;
}
