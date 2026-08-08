import { prisma, type NotificationType } from '@loop/db';
import { SOCKET_EVENTS } from '@loop/shared';
import { emitTo, roomUser } from '../realtime/io.js';
import { logger } from '../lib/logger.js';

interface NotifyInput {
  workspaceId: string;
  userIds: string[];
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/** Creates rows and pushes them down the user's socket room in one go. */
export async function notify({ workspaceId, userIds, actorId, type, title, body, link }: NotifyInput) {
  const targets = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (targets.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        workspaceId,
        userId,
        actorId: actorId ?? null,
        type,
        title,
        body: body ?? null,
        link: link ?? null,
      })),
    });

    const fresh = await prisma.notification.findMany({
      where: { workspaceId, userId: { in: targets }, type, title },
      orderBy: { createdAt: 'desc' },
      take: targets.length,
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });

    for (const row of fresh) emitTo(roomUser(row.userId), SOCKET_EVENTS.notification, row);
  } catch (error: unknown) {
    logger.warn('notify failed', error instanceof Error ? error.message : error);
  }
}

/** Resolves @handles (the part of an email before @, or a name slug) to user ids. */
export async function resolveMentions(workspaceId: string, handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  const ids: string[] = [];
  for (const { user } of members) {
    const local = user.email.split('@')[0]!.toLowerCase();
    const slug = user.name.toLowerCase().replace(/\s+/g, '');
    if (handles.includes(local) || handles.includes(slug)) ids.push(user.id);
  }
  return ids;
}
