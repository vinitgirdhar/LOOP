import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { ah, badRequest, notFound, ok, pagination, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { aiStatus, completeJson, complete } from '../services/ai.js';
import { decideSuggestion } from '../services/autopilot.js';
import { askWorkspace, reindexWorkspace } from '../services/rag.js';
import { features } from '../env.js';
import { audit } from '../services/audit.js';

export const aiRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

aiRouter.get('/status', requireAuth, ah(async (_req, res) => ok(res, aiStatus())));

// ───────────────────────── suggestions inbox ─────────────────────────

aiRouter.get(
  '/suggestions',
  ...base,
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 25);
    const where = {
      workspaceId: req.ws!.workspaceId,
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
      status: (req.query.status ? String(req.query.status) : 'PENDING') as never,
    };
    const [rows, total, pending] = await Promise.all([
      prisma.aiSuggestion.findMany({
        where,
        orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: {
          task: { select: { id: true, number: true, title: true, status: true, isBlocked: true, project: { select: { key: true, name: true } } } },
          project: { select: { id: true, key: true, name: true, autoApply: true } },
          decidedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.aiSuggestion.count({ where }),
      prisma.aiSuggestion.count({ where: { workspaceId: req.ws!.workspaceId, status: 'PENDING' } }),
    ]);
    return ok(res, { items: rows, pending }, { total, page, limit });
  }),
);

aiRouter.post(
  '/suggestions/:id/:decision',
  ...base,
  requirePermission('ai.suggestion.decide'),
  ah(async (req, res) => {
    const decision = req.params.decision.toUpperCase();
    if (decision !== 'ACCEPT' && decision !== 'REJECT') throw badRequest('Decision must be accept or reject');

    const suggestion = await prisma.aiSuggestion.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!suggestion) throw notFound('Suggestion not found');

    const updated = await decideSuggestion(
      suggestion.id,
      decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
      req.user!.id,
      req.user!.name,
    );
    return ok(res, updated);
  }),
);

// ───────────────────────── ask the workspace ─────────────────────────

aiRouter.post(
  '/ask',
  ...base,
  requirePermission('ai.ask'),
  aiLimiter,
  ah(async (req, res) => {
    const { question } = parse(z.object({ question: z.string().min(4).max(500) }), req.body);

    const result = await askWorkspace(
      { workspaceId: req.ws!.workspaceId, userId: req.user!.id, role: req.ws!.role },
      question,
    );

    await prisma.askLog.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        userId: req.user!.id,
        question,
        answer: result.answer,
        citations: result.citations as never,
        model: result.model ?? 'none',
      },
    });
    return ok(res, result);
  }),
);

aiRouter.get(
  '/ask/history',
  ...base,
  ah(async (req, res) => {
    const rows = await prisma.askLog.findMany({
      where: { workspaceId: req.ws!.workspaceId, userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return ok(res, rows);
  }),
);

aiRouter.post(
  '/reindex',
  ...base,
  requirePermission('workspace.update'),
  aiLimiter,
  ah(async (req, res) => {
    const indexed = await reindexWorkspace(req.ws!.workspaceId);
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'ai.reindexed', entity: 'workspace', meta: { indexed } });
    return ok(res, { indexed });
  }),
);

// ───────────────────────── daily standup digest ─────────────────────────

aiRouter.get(
  '/standup/:projectId',
  ...base,
  aiLimiter,
  ah(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, workspaceId: req.ws!.workspaceId },
      select: { id: true, key: true, name: true },
    });
    if (!project) throw notFound('Project not found');

    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [moved, created, blocked, dueSoon, activity] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: project.id, completedAt: { gte: since } },
        select: { number: true, title: true, assignee: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { projectId: project.id, createdAt: { gte: since } },
        select: { number: true, title: true, reporter: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { projectId: project.id, isBlocked: true, completedAt: null },
        select: { number: true, title: true, blockedNote: true, assignee: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { projectId: project.id, completedAt: null, dueDate: { lte: new Date(Date.now() + 2 * 86_400_000) } },
        select: { number: true, title: true, dueDate: true, assignee: { select: { name: true } } },
      }),
      prisma.activityLog.count({ where: { projectId: project.id, createdAt: { gte: since } } }),
    ]);

    const facts = {
      project: `${project.key} — ${project.name}`,
      completedYesterday: moved.map((t) => `${project.key}-${t.number} ${t.title} (${t.assignee?.name ?? 'unassigned'})`),
      createdYesterday: created.map((t) => `${project.key}-${t.number} ${t.title}`),
      blockers: blocked.map((t) => `${project.key}-${t.number} ${t.title} — ${t.blockedNote ?? 'no note'}`),
      dueWithin48h: dueSoon.map((t) => `${project.key}-${t.number} ${t.title} (${t.assignee?.name ?? 'unassigned'})`),
      activityEvents: activity,
    };

    if (!features.ai) return ok(res, { facts, digest: null, model: null });

    const { text, model } = await complete({
      system:
        'You write a short daily standup digest for a software team. Use only the facts given — never invent tasks, names or numbers. ' +
        'Three sections with these exact headings: Shipped, In flight, Needs attention. One line per item, no markdown symbols.',
      prompt: JSON.stringify(facts, null, 2),
      temperature: 0.3,
      maxTokens: 500,
    });
    return ok(res, { facts, digest: text, model });
  }),
);

// ───────────────────────── sprint planning suggestion ─────────────────────────

aiRouter.post(
  '/sprint-plan',
  ...base,
  requirePermission('sprint.manage'),
  aiLimiter,
  ah(async (req, res) => {
    const body = parse(z.object({ projectId: z.string(), capacity: z.number().int().min(1).max(500).optional() }), req.body);

    const project = await prisma.project.findFirst({
      where: { id: body.projectId, workspaceId: req.ws!.workspaceId },
      select: { id: true, key: true, name: true },
    });
    if (!project) throw notFound('Project not found');

    const [backlog, completedSprints] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: project.id, sprintId: null, completedAt: null },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 40,
        select: { id: true, number: true, title: true, priority: true, storyPoints: true, isBlocked: true, dueDate: true },
      }),
      prisma.sprint.findMany({
        where: { projectId: project.id, status: 'COMPLETED' },
        orderBy: { endDate: 'desc' },
        take: 5,
        include: { tasks: { select: { storyPoints: true, completedAt: true } } },
      }),
    ]);

    const velocities = completedSprints.map((s) => s.tasks.filter((t) => t.completedAt).reduce((sum, t) => sum + (t.storyPoints ?? 0), 0));
    const averageVelocity = velocities.length === 0 ? 0 : Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length);
    const capacity = body.capacity ?? (averageVelocity || 20);

    // Deterministic baseline: priority-ordered greedy fill. AI only reorders and explains.
    const order = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
    const greedy: typeof backlog = [];
    let used = 0;
    for (const task of [...backlog].sort((a, b) => order[a.priority] - order[b.priority])) {
      const pts = task.storyPoints ?? 3;
      if (task.isBlocked || used + pts > capacity) continue;
      greedy.push(task);
      used += pts;
    }

    let rationale: string | null = null;
    let model: string | null = null;
    if (features.ai && greedy.length > 0) {
      try {
        const { data, model: usedModel } = await completeJson(
          z.object({ rationale: z.string().max(600), warnings: z.array(z.string().max(200)).max(4) }),
          {
            system:
              'You review a proposed sprint plan that was produced by a deterministic greedy fill. ' +
              'You may not add or remove tasks. Return JSON {"rationale": string, "warnings": string[]}. ' +
              'Keep the rationale under four sentences and base every claim on the data given.',
            prompt: JSON.stringify(
              {
                capacity,
                averageVelocity,
                pastVelocities: velocities,
                selected: greedy.map((t) => ({ key: `${project.key}-${t.number}`, title: t.title, priority: t.priority, points: t.storyPoints ?? 3 })),
                leftOver: backlog.filter((t) => !greedy.includes(t)).length,
                blockedInBacklog: backlog.filter((t) => t.isBlocked).length,
              },
              null,
              2,
            ),
            temperature: 0.3,
            maxTokens: 500,
          },
        );
        rationale = [data.rationale, ...data.warnings.map((w) => `⚠ ${w}`)].join('\n');
        model = usedModel;
      } catch {
        rationale = null;
      }
    }

    return ok(res, {
      capacity,
      averageVelocity,
      pointsUsed: used,
      suggested: greedy.map((t) => ({ ...t, key: `${project.key}-${t.number}`, points: t.storyPoints ?? 3 })),
      skippedBlocked: backlog.filter((t) => t.isBlocked).length,
      rationale,
      model,
    });
  }),
);

// ───────────────────────── estimate a task ─────────────────────────

aiRouter.post(
  '/estimate/:taskId',
  ...base,
  requirePermission('task.update.any'),
  aiLimiter,
  ah(async (req, res) => {
    if (!features.ai) throw badRequest('AI is not configured on this deployment');

    const task = await prisma.task.findFirst({
      where: { id: req.params.taskId, workspaceId: req.ws!.workspaceId },
      include: { project: { select: { id: true, key: true } }, subtasks: true },
    });
    if (!task) throw notFound('Task not found');

    const similar = await prisma.task.findMany({
      where: { projectId: task.projectId, completedAt: { not: null }, storyPoints: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 15,
      select: { title: true, storyPoints: true, estimateHrs: true },
    });

    const { data, model } = await completeJson(
      z.object({ storyPoints: z.number().int().min(1).max(21), hours: z.number().min(0.5).max(200), reasoning: z.string().max(400), confidence: z.number().min(0).max(1) }),
      {
        system:
          'You estimate a software task using the team\'s own history. Return JSON ' +
          '{"storyPoints": int (fibonacci 1,2,3,5,8,13,21), "hours": number, "reasoning": string, "confidence": 0..1}. ' +
          'Anchor on the historical examples rather than a generic scale.',
        prompt: JSON.stringify(
          {
            task: { title: task.title, description: task.description?.slice(0, 1500) ?? '', checklist: task.subtasks.map((s) => s.title) },
            history: similar,
          },
          null,
          2,
        ),
        temperature: 0.2,
        maxTokens: 400,
      },
    );

    // Proposal only — the number is not written to the task until someone accepts.
    return ok(res, { ...data, model, taskKey: `${task.project.key}-${task.number}` });
  }),
);
