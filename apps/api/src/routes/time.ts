import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { can } from '@loop/shared';
import { ah, badRequest, created, forbidden, notFound, ok, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { cleanText } from '../lib/sanitize.js';

export const timeRouter: Router = Router();

const base = [requireAuth, workspaceContext()];
const day = (d: Date) => d.toISOString().slice(0, 10);

timeRouter.get(
  '/running',
  ...base,
  ah(async (req, res) => {
    const running = await prisma.timeLog.findFirst({
      where: { workspaceId: req.ws!.workspaceId, userId: req.user!.id, isRunning: true },
      include: { task: { select: { id: true, number: true, title: true, project: { select: { key: true } } } }, project: { select: { id: true, name: true } } },
    });
    return ok(res, running);
  }),
);

timeRouter.post(
  '/start',
  ...base,
  requirePermission('time.log'),
  ah(async (req, res) => {
    const body = parse(z.object({ taskId: z.string().optional(), projectId: z.string().optional(), note: z.string().max(200).optional() }), req.body);

    const open = await prisma.timeLog.findFirst({ where: { workspaceId: req.ws!.workspaceId, userId: req.user!.id, isRunning: true } });
    if (open) throw badRequest('A timer is already running — stop it first');

    let projectId = body.projectId;
    if (body.taskId) {
      const task = await prisma.task.findFirst({ where: { id: body.taskId, workspaceId: req.ws!.workspaceId } });
      if (!task) throw notFound('Task not found');
      projectId = task.projectId;
    }
    if (!projectId) throw badRequest('Pick a task or a project');

    const log = await prisma.timeLog.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId,
        taskId: body.taskId ?? null,
        userId: req.user!.id,
        isRunning: true,
        startedAt: new Date(),
        note: body.note ? cleanText(body.note) : null,
        day: day(new Date()),
      },
    });
    return created(res, log);
  }),
);

timeRouter.post(
  '/stop',
  ...base,
  requirePermission('time.log'),
  ah(async (req, res) => {
    const open = await prisma.timeLog.findFirst({ where: { workspaceId: req.ws!.workspaceId, userId: req.user!.id, isRunning: true } });
    if (!open) throw badRequest('No timer is running');

    const endedAt = new Date();
    const log = await prisma.timeLog.update({
      where: { id: open.id },
      data: { isRunning: false, endedAt, seconds: Math.max(1, Math.round((endedAt.getTime() - open.startedAt.getTime()) / 1000)) },
    });
    if (log.taskId) await prisma.task.update({ where: { id: log.taskId }, data: { lastActivityAt: new Date() } });
    return ok(res, log);
  }),
);

timeRouter.post(
  '/',
  ...base,
  requirePermission('time.log'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        taskId: z.string().optional(),
        projectId: z.string().optional(),
        minutes: z.number().int().min(1).max(24 * 60),
        note: z.string().max(200).optional(),
        date: z.coerce.date().optional(),
      }),
      req.body,
    );

    let projectId = body.projectId;
    if (body.taskId) {
      const task = await prisma.task.findFirst({ where: { id: body.taskId, workspaceId: req.ws!.workspaceId } });
      if (!task) throw notFound('Task not found');
      projectId = task.projectId;
    }
    if (!projectId) throw badRequest('Pick a task or a project');

    const startedAt = body.date ?? new Date();
    const log = await prisma.timeLog.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId,
        taskId: body.taskId ?? null,
        userId: req.user!.id,
        seconds: body.minutes * 60,
        note: body.note ? cleanText(body.note) : null,
        startedAt,
        endedAt: new Date(startedAt.getTime() + body.minutes * 60_000),
        day: day(startedAt),
      },
    });
    return created(res, log);
  }),
);

timeRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const scopeAll = can(req.ws!.role, 'time.view.team') && req.query.scope === 'team';
    const from = req.query.from ? String(req.query.from) : day(new Date(Date.now() - 30 * 86_400_000));
    const to = req.query.to ? String(req.query.to) : day(new Date());

    const logs = await prisma.timeLog.findMany({
      where: {
        workspaceId: req.ws!.workspaceId,
        ...(scopeAll ? {} : { userId: req.user!.id }),
        ...(req.query.userId && scopeAll ? { userId: String(req.query.userId) } : {}),
        ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
        day: { gte: from, lte: to },
        isRunning: false,
      },
      orderBy: { startedAt: 'desc' },
      take: 500,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        project: { select: { id: true, name: true, key: true, color: true } },
        task: { select: { id: true, number: true, title: true } },
      },
    });

    const totals = {
      seconds: logs.reduce((s, l) => s + l.seconds, 0),
      byProject: Object.entries(
        logs.reduce<Record<string, { name: string; seconds: number }>>((acc, l) => {
          const key = l.project.id;
          acc[key] ??= { name: l.project.name, seconds: 0 };
          acc[key].seconds += l.seconds;
          return acc;
        }, {}),
      ).map(([id, v]) => ({ projectId: id, ...v })),
      byDay: Object.entries(
        logs.reduce<Record<string, number>>((acc, l) => {
          acc[l.day] = (acc[l.day] ?? 0) + l.seconds;
          return acc;
        }, {}),
      )
        .map(([d, seconds]) => ({ day: d, seconds }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    };

    return ok(res, { logs, totals });
  }),
);

timeRouter.delete(
  '/:id',
  ...base,
  ah(async (req, res) => {
    const log = await prisma.timeLog.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!log) throw notFound('Entry not found');
    if (log.userId !== req.user!.id && !can(req.ws!.role, 'time.view.team')) throw forbidden('You can only delete your own entries');
    await prisma.timeLog.delete({ where: { id: log.id } });
    return ok(res, { message: 'Entry deleted' });
  }),
);

/** Manager view: hours by project and per-person utilisation against capacity. */
timeRouter.get(
  '/utilisation',
  ...base,
  requirePermission('time.view.team'),
  ah(async (req, res) => {
    const from = req.query.from ? String(req.query.from) : day(new Date(Date.now() - 7 * 86_400_000));
    const to = req.query.to ? String(req.query.to) : day(new Date());
    const weeks = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / (7 * 86_400_000)) || 1);

    const [members, logs] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: req.ws!.workspaceId },
        select: { capacityHrs: true, user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.timeLog.groupBy({
        by: ['userId'],
        where: { workspaceId: req.ws!.workspaceId, day: { gte: from, lte: to }, isRunning: false },
        _sum: { seconds: true },
      }),
    ]);

    const byUser = new Map(logs.map((l) => [l.userId, l._sum.seconds ?? 0]));
    const rows = members.map((m) => {
      const seconds = byUser.get(m.user.id) ?? 0;
      const capacitySeconds = m.capacityHrs * weeks * 3600;
      return {
        user: m.user,
        hours: Number((seconds / 3600).toFixed(1)),
        capacityHours: m.capacityHrs * weeks,
        utilisation: capacitySeconds === 0 ? 0 : Math.round((seconds / capacitySeconds) * 100),
      };
    });

    return ok(res, { from, to, weeks, rows });
  }),
);
