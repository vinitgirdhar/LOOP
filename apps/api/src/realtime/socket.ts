import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from '@loop/db';
import { SOCKET_EVENTS } from '@loop/shared';
import { verifyAccessToken } from '../lib/crypto.js';
import { corsOrigins } from '../env.js';
import { logger } from '../lib/logger.js';
import { markOffline, markOnline, onlineUsers } from '../lib/redis.js';
import { roomChannel, roomProject, roomUser, roomWorkspace, setIo } from './io.js';

interface SocketUser {
  id: string;
  name: string;
  workspaceIds: string[];
}

/**
 * One namespace, rooms per workspace / project / channel / user. Nothing is
 * ever broadcast to every connected socket — a client only receives events for
 * rooms it was allowed to join.
 */
export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
    // Long polling stays enabled as the fallback when websockets are blocked.
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined;
      if (!token) return next(new Error('unauthorized'));

      const payload = verifyAccessToken(token);
      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
        select: { revokedAt: true, expiresAt: true, user: { select: { id: true, name: true, isSuspended: true } } },
      });
      if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.isSuspended) {
        return next(new Error('unauthorized'));
      }

      const memberships = await prisma.workspaceMember.findMany({
        where: { userId: session.user.id },
        select: { workspaceId: true },
      });
      socket.data.user = {
        id: session.user.id,
        name: session.user.name,
        workspaceIds: memberships.map((m) => m.workspaceId),
      } satisfies SocketUser;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;
    socket.join(roomUser(user.id));

    prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => null);

    socket.on('workspace:join', async (workspaceId: string) => {
      if (!user.workspaceIds.includes(workspaceId)) return;
      socket.join(roomWorkspace(workspaceId));
      await markOnline(workspaceId, user.id);
      io.to(roomWorkspace(workspaceId)).emit(SOCKET_EVENTS.presence, { workspaceId, online: await onlineUsers(workspaceId) });
    });

    socket.on('project:join', async (projectId: string) => {
      const project = await prisma.project.findFirst({
        where: { id: projectId, workspaceId: { in: user.workspaceIds } },
        select: { id: true },
      });
      if (project) socket.join(roomProject(projectId));
    });

    socket.on('project:leave', (projectId: string) => socket.leave(roomProject(projectId)));

    socket.on('channel:join', async (channelId: string) => {
      const channel = await prisma.channel.findFirst({
        where: {
          id: channelId,
          workspaceId: { in: user.workspaceIds },
          OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }],
        },
        select: { id: true },
      });
      if (channel) socket.join(roomChannel(channelId));
    });

    socket.on('channel:leave', (channelId: string) => socket.leave(roomChannel(channelId)));

    socket.on('typing', ({ channelId, typing }: { channelId: string; typing: boolean }) => {
      socket.to(roomChannel(channelId)).emit(SOCKET_EVENTS.typing, { channelId, userId: user.id, name: user.name, typing });
    });

    socket.on('disconnect', async () => {
      for (const workspaceId of user.workspaceIds) {
        const stillHere = await io.in(roomUser(user.id)).fetchSockets();
        if (stillHere.length > 0) continue;
        await markOffline(workspaceId, user.id);
        io.to(roomWorkspace(workspaceId)).emit(SOCKET_EVENTS.presence, { workspaceId, online: await onlineUsers(workspaceId) });
      }
      prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => null);
    });
  });

  setIo(io);
  logger.info('socket.io ready');
  return io;
}
