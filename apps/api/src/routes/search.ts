import { Router } from 'express';
import { prisma } from '@loop/db';
import { atLeast, can } from '@loop/shared';
import { ah, badRequest, ok } from '../lib/http.js';
import { requireAuth, workspaceContext } from '../middleware/auth.js';

export const searchRouter: Router = Router();

/**
 * Global search. Every branch is scoped to the workspace and then to what the
 * caller's role allows — clients never see chat or internal docs, members only
 * see projects they belong to.
 */
searchRouter.get(
  '/',
  requireAuth,
  workspaceContext(),
  ah(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) throw badRequest('Type at least two characters');

    const workspaceId = req.ws!.workspaceId;
    const role = req.ws!.role;
    const contains = { contains: q, mode: 'insensitive' as const };
    const limit = Math.min(10, Number(req.query.limit) || 5);

    const projectIds = atLeast(role, 'PM')
      ? null
      : (await prisma.projectMember.findMany({ where: { userId: req.user!.id, project: { workspaceId } }, select: { projectId: true } })).map((p) => p.projectId);
    const projectScope = projectIds === null ? {} : { projectId: { in: projectIds } };

    const [projects, tasks, members, docs, messages, files] = await Promise.all([
      prisma.project.findMany({
        where: { workspaceId, ...(projectIds === null ? {} : { id: { in: projectIds } }), OR: [{ name: contains }, { key: contains }, { description: contains }] },
        take: limit,
        select: { id: true, name: true, key: true, color: true, status: true },
      }),
      prisma.task.findMany({
        where: { workspaceId, ...projectScope, OR: [{ title: contains }, { description: contains }] },
        take: limit,
        orderBy: { lastActivityAt: 'desc' },
        select: { id: true, number: true, title: true, status: true, priority: true, project: { select: { key: true, color: true } } },
      }),
      prisma.workspaceMember.findMany({
        where: { workspaceId, user: { OR: [{ name: contains }, { email: contains }] } },
        take: limit,
        select: { role: true, user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
      prisma.wikiPage.findMany({
        where: {
          workspaceId,
          ...projectScope,
          ...(role === 'CLIENT' ? { isShared: true } : {}),
          OR: [{ title: contains }, { content: contains }],
        },
        take: limit,
        select: { id: true, title: true, projectId: true, updatedAt: true, isShared: true },
      }),
      can(role, 'chat.read')
        ? prisma.message.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              body: contains,
              channel: { OR: [{ isPrivate: false }, { members: { some: { userId: req.user!.id } } }] },
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: { id: true, body: true, channelId: true, createdAt: true, channel: { select: { name: true } }, author: { select: { name: true, avatarUrl: true } } },
          })
        : Promise.resolve([]),
      prisma.attachment.findMany({
        where: { workspaceId, ...projectScope, name: contains },
        take: limit,
        select: { id: true, name: true, url: true, mime: true, size: true, createdAt: true },
      }),
    ]);

    const total = projects.length + tasks.length + members.length + docs.length + messages.length + files.length;
    return ok(res, { query: q, total, projects, tasks, members, docs, messages, files });
  }),
);
