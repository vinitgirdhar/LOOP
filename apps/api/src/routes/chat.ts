import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { SOCKET_EVENTS } from '@loop/shared';
import { ah, badRequest, created, forbidden, notFound, ok, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { cleanText, extractMentionHandles } from '../lib/sanitize.js';
import { emitTo, roomChannel } from '../realtime/io.js';
import { notify, resolveMentions } from '../services/notify.js';
import { runChatRules } from '../services/autopilot.js';
import { queueEmbedding } from '../services/rag.js';
import { upload } from '../middleware/upload.js';
import { storeFile } from '../lib/storage.js';

export const chatRouter: Router = Router();

// Clients have no chat permission at all, so the whole router is gated on it.
const base = [requireAuth, workspaceContext(), requirePermission('chat.read')];

const messageInclude = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  reactions: { select: { emoji: true, userId: true } },
  attachments: { select: { id: true, name: true, url: true, mime: true, size: true } },
  _count: { select: { replies: true } },
} as const;

async function assertChannelMember(channelId: string, workspaceId: string, userId: string) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, workspaceId },
    include: { members: { where: { userId }, select: { userId: true } } },
  });
  if (!channel) throw notFound('Channel not found');
  if (channel.isPrivate && channel.members.length === 0) throw forbidden('You are not in that channel');
  return channel;
}

chatRouter.get(
  '/channels',
  ...base,
  ah(async (req, res) => {
    const channels = await prisma.channel.findMany({
      where: {
        workspaceId: req.ws!.workspaceId,
        OR: [{ isPrivate: false, type: 'CHANNEL' }, { members: { some: { userId: req.user!.id } } }],
      },
      include: {
        members: { select: { userId: true, lastReadAt: true, user: { select: { id: true, name: true, avatarUrl: true } } } },
        project: { select: { id: true, key: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const withUnread = await Promise.all(
      channels.map(async (c) => {
        const seat = c.members.find((m) => m.userId === req.user!.id);
        const unread = seat
          ? await prisma.message.count({ where: { channelId: c.id, createdAt: { gt: seat.lastReadAt }, authorId: { not: req.user!.id } } })
          : 0;
        return { ...c, unread, joined: Boolean(seat) };
      }),
    );
    return ok(res, withUnread);
  }),
);

chatRouter.post(
  '/channels',
  ...base,
  requirePermission('chat.write'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(1).max(40),
        topic: z.string().max(200).optional(),
        projectId: z.string().nullable().optional(),
        isPrivate: z.boolean().default(false),
        memberIds: z.array(z.string()).default([]),
      }),
      req.body,
    );
    const memberIds = [...new Set([req.user!.id, ...body.memberIds])];
    const channel = await prisma.channel.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId: body.projectId ?? null,
        name: cleanText(body.name).toLowerCase().replace(/\s+/g, '-'),
        topic: body.topic ? cleanText(body.topic) : null,
        isPrivate: body.isPrivate,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
    });
    return created(res, channel);
  }),
);

chatRouter.post(
  '/dm',
  ...base,
  requirePermission('chat.write'),
  ah(async (req, res) => {
    const { userId } = parse(z.object({ userId: z.string() }), req.body);
    if (userId === req.user!.id) throw badRequest('You cannot DM yourself');

    const other = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: req.ws!.workspaceId, userId } },
      include: { user: { select: { name: true } } },
    });
    if (!other) throw notFound('That person is not in this workspace');

    const existing = await prisma.channel.findFirst({
      where: {
        workspaceId: req.ws!.workspaceId,
        type: 'DM',
        AND: [{ members: { some: { userId } } }, { members: { some: { userId: req.user!.id } } }],
      },
    });
    if (existing) return ok(res, existing);

    const channel = await prisma.channel.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        name: `dm-${[req.user!.id, userId].sort().join('-').slice(0, 30)}`,
        type: 'DM',
        isPrivate: true,
        members: { create: [{ userId: req.user!.id }, { userId }] },
      },
    });
    return created(res, channel);
  }),
);

chatRouter.post(
  '/channels/:id/join',
  ...base,
  ah(async (req, res) => {
    const channel = await assertChannelMember(req.params.id, req.ws!.workspaceId, req.user!.id);
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: req.user!.id } },
      create: { channelId: channel.id, userId: req.user!.id },
      update: {},
    });
    return ok(res, { message: `Joined #${channel.name}` });
  }),
);

chatRouter.get(
  '/channels/:id/messages',
  ...base,
  ah(async (req, res) => {
    await assertChannelMember(req.params.id, req.ws!.workspaceId, req.user!.id);
    const take = Math.min(80, Number(req.query.limit) || 40);
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;
    const parentId = req.query.parentId ? String(req.query.parentId) : null;

    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.id,
        parentId,
        deletedAt: null,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: messageInclude,
    });
    return ok(res, messages.reverse());
  }),
);

chatRouter.post(
  '/channels/:id/messages',
  ...base,
  requirePermission('chat.write'),
  upload.array('files', 3),
  ah(async (req, res) => {
    const body = parse(
      z.object({ body: z.string().max(4000).default(''), parentId: z.string().nullable().optional() }),
      { body: req.body.body ?? '', parentId: req.body.parentId ?? null },
    );
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!body.body.trim() && files.length === 0) throw badRequest('Write something or attach a file');

    const channel = await assertChannelMember(req.params.id, req.ws!.workspaceId, req.user!.id);
    const text = cleanText(body.body);
    const mentionIds = await resolveMentions(req.ws!.workspaceId, extractMentionHandles(text));

    const message = await prisma.message.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        channelId: channel.id,
        authorId: req.user!.id,
        body: text,
        mentions: mentionIds,
        parentId: body.parentId ?? null,
      },
      include: messageInclude,
    });

    if (files.length > 0) {
      const stored = await Promise.all(files.map((f) => storeFile(f, `chat/${channel.id}`)));
      await prisma.attachment.createMany({
        data: stored.map((s) => ({
          workspaceId: req.ws!.workspaceId,
          projectId: channel.projectId,
          messageId: message.id,
          name: s.name,
          url: s.url,
          publicId: s.publicId,
          mime: s.mime,
          size: s.size,
          uploadedById: req.user!.id,
        })),
      });
    }

    const hydrated = await prisma.message.findUniqueOrThrow({ where: { id: message.id }, include: messageInclude });
    emitTo(roomChannel(channel.id), SOCKET_EVENTS.messageNew, hydrated);

    if (mentionIds.length > 0) {
      await notify({
        workspaceId: req.ws!.workspaceId,
        userIds: mentionIds,
        actorId: req.user!.id,
        type: 'MENTION',
        title: `${req.user!.name} mentioned you in #${channel.name}`,
        body: text.slice(0, 140),
        link: `/w/${req.ws!.workspaceId}/chat/${channel.id}`,
      });
    }

    // Auto-Pilot listens to chat: "I'm stuck on the payment API" becomes a proposal.
    void runChatRules({
      workspaceId: req.ws!.workspaceId,
      projectId: channel.projectId,
      authorName: req.user!.name,
      text,
      sourceLabel: `#${channel.name}`,
      sourceUrl: `/w/${req.ws!.workspaceId}/chat/${channel.id}`,
    });
    void queueEmbedding({ workspaceId: req.ws!.workspaceId, projectId: channel.projectId, sourceType: 'message', sourceId: message.id });

    return created(res, hydrated);
  }),
);

chatRouter.patch(
  '/messages/:id',
  ...base,
  ah(async (req, res) => {
    const { body: text } = parse(z.object({ body: z.string().min(1).max(4000) }), req.body);
    const message = await prisma.message.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!message) throw notFound('Message not found');
    if (message.authorId !== req.user!.id) throw forbidden('You can only edit your own messages');

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { body: cleanText(text), editedAt: new Date() },
      include: messageInclude,
    });
    emitTo(roomChannel(message.channelId), SOCKET_EVENTS.messageUpdate, updated);
    return ok(res, updated);
  }),
);

chatRouter.delete(
  '/messages/:id',
  ...base,
  ah(async (req, res) => {
    const message = await prisma.message.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!message) throw notFound('Message not found');
    if (message.authorId !== req.user!.id && req.ws!.role !== 'OWNER') throw forbidden('You can only delete your own messages');

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), body: '' },
      include: messageInclude,
    });
    emitTo(roomChannel(message.channelId), SOCKET_EVENTS.messageUpdate, { ...updated, deleted: true });
    return ok(res, { message: 'Deleted' });
  }),
);

chatRouter.post(
  '/messages/:id/reactions',
  ...base,
  requirePermission('chat.write'),
  ah(async (req, res) => {
    const { emoji } = parse(z.object({ emoji: z.string().min(1).max(8) }), req.body);
    const message = await prisma.message.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!message) throw notFound('Message not found');

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId: message.id, userId: req.user!.id, emoji } },
    });
    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.messageReaction.create({ data: { messageId: message.id, userId: req.user!.id, emoji } });
    }

    const reactions = await prisma.messageReaction.findMany({ where: { messageId: message.id }, select: { emoji: true, userId: true } });
    emitTo(roomChannel(message.channelId), SOCKET_EVENTS.reactionUpdate, { messageId: message.id, reactions });
    return ok(res, reactions);
  }),
);

chatRouter.post(
  '/channels/:id/read',
  ...base,
  ah(async (req, res) => {
    await prisma.channelMember.updateMany({
      where: { channelId: req.params.id, userId: req.user!.id },
      data: { lastReadAt: new Date() },
    });
    return ok(res, { message: 'Marked as read' });
  }),
);
