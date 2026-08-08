import { Router } from 'express';
import { prisma } from '@loop/db';
import { ah, ok, pagination } from '../lib/http.js';
import { requireAuth, workspaceContext } from '../middleware/auth.js';

export const notificationRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

notificationRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 25);
    const where = {
      workspaceId: req.ws!.workspaceId,
      userId: req.user!.id,
      ...(req.query.unread === 'true' ? { readAt: null } : {}),
    };
    const [rows, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { workspaceId: req.ws!.workspaceId, userId: req.user!.id, readAt: null } }),
    ]);
    return ok(res, { items: rows, unread }, { total, page, limit });
  }),
);

notificationRouter.post(
  '/:id/read',
  ...base,
  ah(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    return ok(res, { message: 'Marked as read' });
  }),
);

notificationRouter.post(
  '/read-all',
  ...base,
  ah(async (req, res) => {
    const { count } = await prisma.notification.updateMany({
      where: { workspaceId: req.ws!.workspaceId, userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(res, { updated: count });
  }),
);

notificationRouter.delete(
  '/:id',
  ...base,
  ah(async (req, res) => {
    await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    return ok(res, { message: 'Dismissed' });
  }),
);
