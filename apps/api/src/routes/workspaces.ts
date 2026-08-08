import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { ROLES } from '@loop/shared';
import { ah, badRequest, conflict, created, forbidden, notFound, ok, pagination, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { randomToken } from '../lib/crypto.js';
import { cleanText } from '../lib/sanitize.js';
import { audit } from '../services/audit.js';
import { mails, sendMail } from '../lib/mailer.js';
import { env } from '../env.js';
import { imageOnly } from '../middleware/upload.js';
import { storeFile } from '../lib/storage.js';
import { notify } from '../services/notify.js';
import { onlineUsers } from '../lib/redis.js';

export const workspaceRouter: Router = Router();
export const inviteRouter: Router = Router();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'workspace';

async function uniqueSlug(base: string) {
  let slug = base;
  for (let i = 2; await prisma.workspace.findUnique({ where: { slug } }); i += 1) slug = `${base}-${i}`;
  return slug;
}

const memberSelect = {
  id: true,
  role: true,
  title: true,
  capacityHrs: true,
  joinedAt: true,
  department: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true, avatarUrl: true, lastSeenAt: true } },
} as const;

// ───────────────────────── create / list ─────────────────────────

workspaceRouter.post(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const body = parse(
      z.object({ name: z.string().min(2).max(60), organizationName: z.string().min(2).max(60).optional() }),
      req.body,
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    // PS-5: email verification is mandatory before workspace creation.
    if (!user.emailVerifiedAt) throw forbidden('Verify your email before creating a workspace');

    const orgName = body.organizationName ?? body.name;
    const plan = await prisma.billingPlan.findUnique({ where: { key: 'free' } });

    const workspace = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: cleanText(orgName),
          slug: await uniqueSlug(slugify(orgName)),
          ownerId: user.id,
          planId: plan?.id ?? null,
        },
      });
      const ws = await tx.workspace.create({
        data: {
          name: cleanText(body.name),
          slug: await uniqueSlug(slugify(body.name)),
          organizationId: organization.id,
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
      });
      await tx.channel.create({
        data: {
          workspaceId: ws.id,
          name: 'general',
          topic: 'Everything that does not belong anywhere else',
          members: { create: { userId: user.id } },
        },
      });
      return ws;
    });

    await audit({ req, workspaceId: workspace.id, action: 'workspace.created', entity: 'workspace', entityId: workspace.id });
    return created(res, workspace);
  }),
);

workspaceRouter.get(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user!.id },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            description: true,
            createdAt: true,
            _count: { select: { projects: true, members: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return ok(res, memberships.map((m) => ({ ...m.workspace, role: m.role })));
  }),
);

workspaceRouter.get(
  '/:workspaceId',
  requireAuth,
  workspaceContext(),
  ah(async (req, res) => {
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: req.ws!.workspaceId },
      include: {
        organization: { select: { id: true, name: true, plan: { select: { key: true, name: true, seats: true, priceMonthly: true } } } },
        departments: { orderBy: { name: 'asc' } },
        _count: { select: { members: true, projects: true } },
      },
    });
    return ok(res, { ...workspace, role: req.ws!.role });
  }),
);

workspaceRouter.patch(
  '/:workspaceId',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.update'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ name: z.string().min(2).max(60).optional(), description: z.string().max(500).nullable().optional() }),
      req.body,
    );
    const workspace = await prisma.workspace.update({
      where: { id: req.ws!.workspaceId },
      data: {
        ...(body.name ? { name: cleanText(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description ? cleanText(body.description) : null } : {}),
      },
    });
    await audit({ req, workspaceId: workspace.id, action: 'workspace.updated', entity: 'workspace', entityId: workspace.id, meta: body });
    return ok(res, workspace);
  }),
);

workspaceRouter.post(
  '/:workspaceId/logo',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.update'),
  imageOnly.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('No image uploaded');
    const stored = await storeFile(req.file, `workspaces/${req.ws!.workspaceId}`);
    const workspace = await prisma.workspace.update({
      where: { id: req.ws!.workspaceId },
      data: { logoUrl: stored.url },
    });
    return ok(res, workspace);
  }),
);

workspaceRouter.delete(
  '/:workspaceId',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.delete'),
  ah(async (req, res) => {
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'workspace.deleted', entity: 'workspace', entityId: req.ws!.workspaceId });
    await prisma.workspace.delete({ where: { id: req.ws!.workspaceId } });
    return ok(res, { message: 'Workspace deleted' });
  }),
);

// ───────────────────────── members ─────────────────────────

workspaceRouter.get(
  '/:workspaceId/members',
  requireAuth,
  workspaceContext(),
  ah(async (req, res) => {
    const [members, online] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: req.ws!.workspaceId },
        select: memberSelect,
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      }),
      onlineUsers(req.ws!.workspaceId),
    ]);
    const onlineSet = new Set(online);
    return ok(res, members.map((m) => ({ ...m, online: onlineSet.has(m.user.id) })));
  }),
);

workspaceRouter.patch(
  '/:workspaceId/members/:memberId',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.member.manage'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        role: z.enum(ROLES).optional(),
        departmentId: z.string().nullable().optional(),
        title: z.string().max(60).nullable().optional(),
        capacityHrs: z.number().int().min(0).max(80).optional(),
      }),
      req.body,
    );

    const member = await prisma.workspaceMember.findFirst({
      where: { id: req.params.memberId, workspaceId: req.ws!.workspaceId },
    });
    if (!member) throw notFound('Member not found');

    if (body.role && body.role !== member.role && member.role === 'OWNER') {
      const owners = await prisma.workspaceMember.count({ where: { workspaceId: req.ws!.workspaceId, role: 'OWNER' } });
      if (owners <= 1) throw badRequest('A workspace needs at least one owner');
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: member.id },
      data: body,
      select: memberSelect,
    });

    if (body.role && body.role !== member.role) {
      await audit({
        req,
        workspaceId: req.ws!.workspaceId,
        action: 'member.role_changed',
        entity: 'workspace_member',
        entityId: member.id,
        meta: { from: member.role, to: body.role, userId: member.userId },
      });
    }
    return ok(res, updated);
  }),
);

workspaceRouter.delete(
  '/:workspaceId/members/:memberId',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.member.manage'),
  ah(async (req, res) => {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: req.params.memberId, workspaceId: req.ws!.workspaceId },
    });
    if (!member) throw notFound('Member not found');
    if (member.role === 'OWNER') {
      const owners = await prisma.workspaceMember.count({ where: { workspaceId: req.ws!.workspaceId, role: 'OWNER' } });
      if (owners <= 1) throw badRequest('A workspace needs at least one owner');
    }
    await prisma.workspaceMember.delete({ where: { id: member.id } });
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'member.removed', entity: 'workspace_member', entityId: member.id, meta: { userId: member.userId } });
    return ok(res, { message: 'Member removed' });
  }),
);

// ───────────────────────── departments ─────────────────────────

workspaceRouter.post(
  '/:workspaceId/departments',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.department.manage'),
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().min(2).max(60), description: z.string().max(200).optional() }), req.body);
    const department = await prisma.department.create({
      data: { workspaceId: req.ws!.workspaceId, name: cleanText(body.name), description: body.description ? cleanText(body.description) : null },
    });
    return created(res, department);
  }),
);

workspaceRouter.patch(
  '/:workspaceId/departments/:id',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.department.manage'),
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().min(2).max(60).optional(), description: z.string().max(200).nullable().optional() }), req.body);
    const { count } = await prisma.department.updateMany({
      where: { id: req.params.id, workspaceId: req.ws!.workspaceId },
      data: body,
    });
    if (count === 0) throw notFound('Department not found');
    return ok(res, await prisma.department.findUnique({ where: { id: req.params.id } }));
  }),
);

workspaceRouter.delete(
  '/:workspaceId/departments/:id',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.department.manage'),
  ah(async (req, res) => {
    const { count } = await prisma.department.deleteMany({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (count === 0) throw notFound('Department not found');
    return ok(res, { message: 'Department deleted' });
  }),
);

// ───────────────────────── invites ─────────────────────────

workspaceRouter.post(
  '/:workspaceId/invites',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.invite'),
  ah(async (req, res) => {
    const body = parse(z.object({ email: z.string().email().toLowerCase(), role: z.enum(ROLES).default('MEMBER') }), req.body);

    const already = await prisma.workspaceMember.findFirst({
      where: { workspaceId: req.ws!.workspaceId, user: { email: body.email } },
    });
    if (already) throw conflict('That person is already in this workspace');

    const token = randomToken(24);
    const invite = await prisma.invite.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        email: body.email,
        role: body.role,
        token,
        invitedById: req.user!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      include: { workspace: { select: { name: true } } },
    });

    await sendMail({
      to: body.email,
      subject: `${req.user!.name} invited you to ${invite.workspace.name} on Loop`,
      html: mails.invite(invite.workspace.name, req.user!.name, `${env.WEB_URL}/invite/${token}`),
    });
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'invite.sent', entity: 'invite', entityId: invite.id, meta: { email: body.email, role: body.role } });

    return created(res, { ...invite, link: `${env.WEB_URL}/invite/${token}` });
  }),
);

workspaceRouter.get(
  '/:workspaceId/invites',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.invite'),
  ah(async (req, res) => {
    const invites = await prisma.invite.findMany({
      where: { workspaceId: req.ws!.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { name: true } } },
    });
    return ok(res, invites.map((i) => ({ ...i, link: `${env.WEB_URL}/invite/${i.token}` })));
  }),
);

workspaceRouter.delete(
  '/:workspaceId/invites/:id',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.invite'),
  ah(async (req, res) => {
    const { count } = await prisma.invite.deleteMany({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (count === 0) throw notFound('Invite not found');
    return ok(res, { message: 'Invite revoked' });
  }),
);

inviteRouter.get(
  '/:token',
  ah(async (req, res) => {
    const invite = await prisma.invite.findUnique({
      where: { token: req.params.token },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        workspace: { select: { id: true, name: true, logoUrl: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw notFound('This invite is no longer valid');
    return ok(res, invite);
  }),
);

inviteRouter.post(
  '/:token/accept',
  requireAuth,
  ah(async (req, res) => {
    const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw notFound('This invite is no longer valid');
    if (invite.email !== req.user!.email.toLowerCase()) {
      throw forbidden(`This invite was sent to ${invite.email}. Sign in with that account.`);
    }

    const member = await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: req.user!.id } },
      create: { workspaceId: invite.workspaceId, userId: req.user!.id, role: invite.role },
      update: {},
    });
    await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

    const general = await prisma.channel.findFirst({ where: { workspaceId: invite.workspaceId, name: 'general', projectId: null } });
    if (general) {
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId: general.id, userId: req.user!.id } },
        create: { channelId: general.id, userId: req.user!.id },
        update: {},
      });
    }

    await notify({
      workspaceId: invite.workspaceId,
      userIds: [invite.invitedById],
      actorId: req.user!.id,
      type: 'INVITE',
      title: `${req.user!.name} joined the workspace`,
      link: `/w/${invite.workspaceId}/settings/members`,
    });
    await audit({ req, workspaceId: invite.workspaceId, action: 'invite.accepted', entity: 'workspace_member', entityId: member.id });

    return ok(res, { workspaceId: invite.workspaceId, role: invite.role });
  }),
);

// ───────────────────────── audit & activity ─────────────────────────

workspaceRouter.get(
  '/:workspaceId/audit-logs',
  requireAuth,
  workspaceContext(),
  requirePermission('workspace.audit.view'),
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 30);
    const where = {
      workspaceId: req.ws!.workspaceId,
      ...(req.query.action ? { action: { contains: String(req.query.action) } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { actor: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return ok(res, rows, { total, page, limit });
  }),
);

workspaceRouter.get(
  '/:workspaceId/activity',
  requireAuth,
  workspaceContext(),
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 30);
    const where = {
      workspaceId: req.ws!.workspaceId,
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true, key: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);
    return ok(res, rows, { total, page, limit });
  }),
);
