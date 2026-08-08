import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { ah, badRequest, created, notFound, ok, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { cleanText } from '../lib/sanitize.js';
import { activity, audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { snapshotBurndown } from '../services/sprintMetrics.js';

export const sprintRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

async function loadSprint(id: string, workspaceId: string) {
  const sprint = await prisma.sprint.findFirst({ where: { id, workspaceId } });
  if (!sprint) throw notFound('Sprint not found');
  return sprint;
}

sprintRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const sprints = await prisma.sprint.findMany({
      where: {
        workspaceId: req.ws!.workspaceId,
        ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
        ...(req.query.status ? { status: String(req.query.status) as never } : {}),
      },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: {
        project: { select: { id: true, key: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });
    return ok(res, sprints);
  }),
);

sprintRouter.get(
  '/:id',
  ...base,
  ah(async (req, res) => {
    const sprint = await loadSprint(req.params.id, req.ws!.workspaceId);
    const [full, tasks] = await Promise.all([
      prisma.sprint.findUniqueOrThrow({
        where: { id: sprint.id },
        include: { project: { select: { id: true, key: true, name: true, columns: { orderBy: { order: 'asc' } } } } },
      }),
      prisma.task.findMany({
        where: { sprintId: sprint.id },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          labels: { include: { label: true } },
        },
        orderBy: { order: 'asc' },
      }),
    ]);

    const doneKeys = full.project.columns.filter((c) => c.isDone).map((c) => c.key);
    const totalPts = tasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const donePts = tasks.filter((t) => t.completedAt || doneKeys.includes(t.status)).reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const blockers = tasks.filter((t) => t.isBlocked);

    return ok(res, {
      ...full,
      tasks: tasks.map((t) => ({ ...t, labels: t.labels.map((l) => l.label) })),
      stats: {
        totalTasks: tasks.length,
        doneTasks: tasks.filter((t) => t.completedAt || doneKeys.includes(t.status)).length,
        totalPoints: totalPts,
        donePoints: donePts,
        completion: totalPts === 0 ? 0 : Math.round((donePts / totalPts) * 100),
        capacityUsed: full.capacity === 0 ? 0 : Math.round((totalPts / full.capacity) * 100),
        blockers: blockers.map((b) => ({ id: b.id, number: b.number, title: b.title, note: b.blockedNote })),
      },
    });
  }),
);

sprintRouter.post(
  '/',
  ...base,
  requirePermission('sprint.manage'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        projectId: z.string(),
        name: z.string().min(2).max(80),
        goal: z.string().max(500).optional(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        capacity: z.number().int().min(1).max(500).default(40),
        taskIds: z.array(z.string()).default([]),
      }),
      req.body,
    );
    if (body.endDate <= body.startDate) throw badRequest('The sprint must end after it starts');

    const project = await prisma.project.findFirst({ where: { id: body.projectId, workspaceId: req.ws!.workspaceId } });
    if (!project) throw notFound('Project not found');

    const sprint = await prisma.sprint.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId: project.id,
        name: cleanText(body.name),
        goal: body.goal ? cleanText(body.goal) : null,
        startDate: body.startDate,
        endDate: body.endDate,
        capacity: body.capacity,
      },
    });

    if (body.taskIds.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: body.taskIds }, projectId: project.id },
        data: { sprintId: sprint.id },
      });
    }
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'sprint.created', entity: 'sprint', entityId: sprint.id });
    return created(res, sprint);
  }),
);

sprintRouter.patch(
  '/:id',
  ...base,
  requirePermission('sprint.manage'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80).optional(),
        goal: z.string().max(500).nullable().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        capacity: z.number().int().min(1).max(500).optional(),
      }),
      req.body,
    );
    const sprint = await loadSprint(req.params.id, req.ws!.workspaceId);
    const updated = await prisma.sprint.update({ where: { id: sprint.id }, data: body });
    return ok(res, updated);
  }),
);

sprintRouter.post(
  '/:id/start',
  ...base,
  requirePermission('sprint.manage'),
  ah(async (req, res) => {
    const sprint = await loadSprint(req.params.id, req.ws!.workspaceId);
    if (sprint.status !== 'PLANNED') throw badRequest('Only a planned sprint can be started');

    const running = await prisma.sprint.findFirst({ where: { projectId: sprint.projectId, status: 'ACTIVE' } });
    if (running) throw badRequest(`${running.name} is still active — close it first`);

    const updated = await prisma.sprint.update({ where: { id: sprint.id }, data: { status: 'ACTIVE' } });
    await snapshotBurndown(sprint.id);

    const members = await prisma.projectMember.findMany({ where: { projectId: sprint.projectId }, select: { userId: true } });
    await notify({
      workspaceId: req.ws!.workspaceId,
      userIds: members.map((m) => m.userId),
      actorId: req.user!.id,
      type: 'SPRINT_STARTED',
      title: `${sprint.name} started`,
      body: sprint.goal ?? undefined,
      link: `/w/${req.ws!.workspaceId}/sprints/${sprint.id}`,
    });
    await activity({
      workspaceId: req.ws!.workspaceId,
      projectId: sprint.projectId,
      actorId: req.user!.id,
      type: 'sprint.started',
      message: `${req.user!.name} started ${sprint.name}`,
    });
    return ok(res, updated);
  }),
);

sprintRouter.post(
  '/:id/complete',
  ...base,
  requirePermission('sprint.manage'),
  ah(async (req, res) => {
    const { moveUnfinishedTo } = parse(z.object({ moveUnfinishedTo: z.string().nullable().default(null) }), req.body ?? {});
    const sprint = await loadSprint(req.params.id, req.ws!.workspaceId);
    if (sprint.status === 'COMPLETED') throw badRequest('That sprint is already closed');

    await snapshotBurndown(sprint.id);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: sprint.projectId }, select: { columns: true } });
    const doneKeys = project.columns.filter((c) => c.isDone).map((c) => c.key);

    const unfinished = await prisma.task.findMany({
      where: { sprintId: sprint.id, completedAt: null, status: { notIn: doneKeys } },
      select: { id: true, storyPoints: true },
    });
    await prisma.task.updateMany({
      where: { id: { in: unfinished.map((t) => t.id) } },
      data: { sprintId: moveUnfinishedTo },
    });

    const updated = await prisma.sprint.update({ where: { id: sprint.id }, data: { status: 'COMPLETED' } });

    const members = await prisma.projectMember.findMany({ where: { projectId: sprint.projectId }, select: { userId: true } });
    await notify({
      workspaceId: req.ws!.workspaceId,
      userIds: members.map((m) => m.userId),
      actorId: req.user!.id,
      type: 'SPRINT_ENDED',
      title: `${sprint.name} closed`,
      body: `${unfinished.length} unfinished item(s) rolled over`,
      link: `/w/${req.ws!.workspaceId}/sprints/${sprint.id}`,
    });
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'sprint.completed', entity: 'sprint', entityId: sprint.id, meta: { rolledOver: unfinished.length } });

    return ok(res, { sprint: updated, rolledOver: unfinished.length });
  }),
);

sprintRouter.delete(
  '/:id',
  ...base,
  requirePermission('sprint.manage'),
  ah(async (req, res) => {
    const sprint = await loadSprint(req.params.id, req.ws!.workspaceId);
    await prisma.sprint.delete({ where: { id: sprint.id } });
    return ok(res, { message: 'Sprint deleted' });
  }),
);

sprintRouter.get(
  '/:id/burndown',
  ...base,
  ah(async (req, res) => {
    const sprint = await loadSprint(req.params.id, req.ws!.workspaceId);
    const [points, tasks] = await Promise.all([
      prisma.burndownPoint.findMany({ where: { sprintId: sprint.id }, orderBy: { date: 'asc' } }),
      prisma.task.findMany({ where: { sprintId: sprint.id }, select: { storyPoints: true, completedAt: true } }),
    ]);

    const totalPts = tasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const days = Math.max(1, Math.ceil((sprint.endDate.getTime() - sprint.startDate.getTime()) / 86_400_000));

    const ideal = Array.from({ length: days + 1 }, (_, i) => ({
      date: new Date(sprint.startDate.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      remaining: Number((totalPts * (1 - i / days)).toFixed(1)),
    }));

    return ok(res, {
      totalPoints: totalPts,
      ideal,
      actual: points.map((p) => ({
        date: p.date.toISOString().slice(0, 10),
        remaining: p.remainingPts,
        completed: p.completedPts,
        remainingTasks: p.remainingTasks,
      })),
      burnup: points.map((p) => ({ date: p.date.toISOString().slice(0, 10), completed: p.completedPts, scope: p.remainingPts + p.completedPts })),
    });
  }),
);

sprintRouter.get(
  '/velocity/:projectId',
  ...base,
  ah(async (req, res) => {
    const sprints = await prisma.sprint.findMany({
      where: { projectId: req.params.projectId, workspaceId: req.ws!.workspaceId, status: 'COMPLETED' },
      orderBy: { endDate: 'asc' },
      take: 10,
      include: { tasks: { select: { storyPoints: true, completedAt: true } } },
    });

    const rows = sprints.map((s) => ({
      sprint: s.name,
      committed: s.tasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0),
      completed: s.tasks.filter((t) => t.completedAt).reduce((sum, t) => sum + (t.storyPoints ?? 0), 0),
      capacity: s.capacity,
    }));
    const average = rows.length === 0 ? 0 : Math.round(rows.reduce((s, r) => s + r.completed, 0) / rows.length);

    return ok(res, { sprints: rows, averageVelocity: average });
  }),
);
