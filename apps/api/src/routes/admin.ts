import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { ROLES } from '@loop/shared';
import { ah, badRequest, created, notFound, ok, pagination, parse } from '../lib/http.js';
import { requireAuth, requirePlatformAdmin, requirePermission, workspaceContext } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { cleanText } from '../lib/sanitize.js';

export const adminRouter: Router = Router();
export const integrationRouter: Router = Router();

const admin = [requireAuth, requirePlatformAdmin];

// ───────────────────────── platform overview ─────────────────────────

adminRouter.get(
  '/stats',
  ...admin,
  ah(async (_req, res) => {
    const [users, orgs, workspaces, projects, tasks, suggestions, sessions, storage] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.workspace.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.aiSuggestion.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.attachment.aggregate({ _sum: { size: true }, _count: { _all: true } }),
    ]);

    const signups = await prisma.user.groupBy({
      by: ['createdAt'],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    });
    const byDay = signups.reduce<Record<string, number>>((acc, row) => {
      const key = row.createdAt.toISOString().slice(0, 10);
      acc[key] = (acc[key] ?? 0) + row._count._all;
      return acc;
    }, {});

    return ok(res, {
      users,
      organizations: orgs,
      workspaces,
      projects,
      tasks,
      activeSessions: sessions,
      files: { count: storage._count._all, bytes: storage._sum.size ?? 0 },
      suggestions: Object.fromEntries(suggestions.map((s) => [s.status, s._count._all])),
      signups: Object.entries(byDay).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)),
    });
  }),
);

// ───────────────────────── users ─────────────────────────

adminRouter.get(
  '/users',
  ...admin,
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 25);
    const q = req.query.q ? String(req.query.q) : undefined;
    const where = q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }] } : {};

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, avatarUrl: true, emailVerifiedAt: true,
          isPlatformAdmin: true, isSuspended: true, twoFactorOn: true, createdAt: true, lastSeenAt: true,
          _count: { select: { memberships: true, sessions: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return ok(res, rows, { total, page, limit });
  }),
);

adminRouter.patch(
  '/users/:id',
  ...admin,
  ah(async (req, res) => {
    const body = parse(z.object({ isSuspended: z.boolean().optional(), isPlatformAdmin: z.boolean().optional() }), req.body);
    if (req.params.id === req.user!.id && body.isPlatformAdmin === false) throw badRequest('You cannot remove your own admin rights');

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: body,
      select: { id: true, email: true, isSuspended: true, isPlatformAdmin: true },
    });
    if (body.isSuspended) {
      await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit({ req, action: 'admin.user_updated', entity: 'user', entityId: user.id, meta: body });
    return ok(res, user);
  }),
);

adminRouter.delete(
  '/users/:id',
  ...admin,
  ah(async (req, res) => {
    if (req.params.id === req.user!.id) throw badRequest('You cannot delete your own account here');
    await prisma.user.delete({ where: { id: req.params.id } });
    await audit({ req, action: 'admin.user_deleted', entity: 'user', entityId: req.params.id });
    return ok(res, { message: 'User deleted' });
  }),
);

// ───────────────────────── organizations & workspaces ─────────────────────────

adminRouter.get(
  '/organizations',
  ...admin,
  ah(async (_req, res) => {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        plan: true,
        workspaces: { select: { id: true, name: true, _count: { select: { members: true, projects: true } } } },
      },
    });
    return ok(res, orgs);
  }),
);

adminRouter.patch(
  '/organizations/:id/plan',
  ...admin,
  ah(async (req, res) => {
    const { planKey } = parse(z.object({ planKey: z.string() }), req.body);
    const plan = await prisma.billingPlan.findUnique({ where: { key: planKey } });
    if (!plan) throw notFound('Plan not found');
    const org = await prisma.organization.update({ where: { id: req.params.id }, data: { planId: plan.id }, include: { plan: true } });
    await audit({ req, action: 'admin.plan_changed', entity: 'organization', entityId: org.id, meta: { planKey } });
    return ok(res, org);
  }),
);

adminRouter.get(
  '/workspaces',
  ...admin,
  ah(async (_req, res) => {
    const workspaces = await prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { members: true, projects: true, tasks: true } },
      },
    });
    return ok(res, workspaces);
  }),
);

adminRouter.get(
  '/projects',
  ...admin,
  ah(async (_req, res) => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { workspace: { select: { id: true, name: true } }, _count: { select: { tasks: true, members: true } } },
    });
    return ok(res, projects);
  }),
);

// ───────────────────────── billing plans (display only) ─────────────────────────

adminRouter.get('/billing-plans', ...admin, ah(async (_req, res) => ok(res, await prisma.billingPlan.findMany({ orderBy: { priceMonthly: 'asc' } }))));

// ───────────────────────── roles & permissions ─────────────────────────

adminRouter.get(
  '/roles',
  ...admin,
  ah(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { rank: 'desc' },
      include: { permissions: { include: { permission: true } } },
    });
    return ok(
      res,
      roles.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        rank: r.rank,
        permissions: r.permissions.map((p) => ({ key: p.permission.key, description: p.permission.description })),
      })),
    );
  }),
);

// ───────────────────────── audit logs ─────────────────────────

adminRouter.get(
  '/audit-logs',
  ...admin,
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 40);
    const where = {
      ...(req.query.action ? { action: { contains: String(req.query.action) } } : {}),
      ...(req.query.workspaceId ? { workspaceId: String(req.query.workspaceId) } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, email: true } }, workspace: { select: { id: true, name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return ok(res, rows, { total, page, limit });
  }),
);

// ───────────────────────── feature flags ─────────────────────────

adminRouter.get('/feature-flags', ...admin, ah(async (_req, res) => ok(res, await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }))));

adminRouter.post(
  '/feature-flags',
  ...admin,
  ah(async (req, res) => {
    const body = parse(
      z.object({ key: z.string().min(2).max(60), description: z.string().max(200), enabled: z.boolean().default(false), rollout: z.number().int().min(0).max(100).default(0) }),
      req.body,
    );
    const flag = await prisma.featureFlag.upsert({
      where: { key: body.key },
      create: { ...body, description: cleanText(body.description) },
      update: { description: cleanText(body.description), enabled: body.enabled, rollout: body.rollout },
    });
    await audit({ req, action: 'admin.flag_saved', entity: 'feature_flag', entityId: flag.id, meta: body });
    return created(res, flag);
  }),
);

adminRouter.patch(
  '/feature-flags/:key',
  ...admin,
  ah(async (req, res) => {
    const body = parse(z.object({ enabled: z.boolean().optional(), rollout: z.number().int().min(0).max(100).optional() }), req.body);
    const flag = await prisma.featureFlag.update({ where: { key: req.params.key }, data: body });
    await audit({ req, action: 'admin.flag_toggled', entity: 'feature_flag', entityId: flag.id, meta: body });
    return ok(res, flag);
  }),
);

adminRouter.get(
  '/integrations',
  ...admin,
  ah(async (_req, res) => {
    const rows = await prisma.integration.findMany({ include: { workspace: { select: { id: true, name: true } } } });
    return ok(res, rows);
  }),
);

// ───────────────────────── workspace-level integrations ─────────────────────────

const wsBase = [requireAuth, workspaceContext(), requirePermission('workspace.integration.manage')];

integrationRouter.get(
  '/',
  requireAuth,
  workspaceContext(),
  ah(async (req, res) => {
    const rows = await prisma.integration.findMany({
      where: { workspaceId: req.ws!.workspaceId },
      include: { project: { select: { id: true, key: true, name: true } } },
    });
    return ok(res, rows);
  }),
);

integrationRouter.post(
  '/',
  ...wsBase,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        provider: z.enum(['github', 'google_calendar', 'google_drive', 'slack']),
        projectId: z.string().nullable().optional(),
        config: z.record(z.string(), z.string()).default({}),
        enabled: z.boolean().default(true),
      }),
      req.body,
    );
    if (body.provider === 'github' && !body.config.repo) throw badRequest('Give the repository as owner/name');

    // projectId is nullable, so a compound-unique upsert is not expressible — find then write.
    const existing = await prisma.integration.findFirst({
      where: { workspaceId: req.ws!.workspaceId, provider: body.provider, projectId: body.projectId ?? null },
    });
    const integration = existing
      ? await prisma.integration.update({ where: { id: existing.id }, data: { config: body.config, enabled: body.enabled } })
      : await prisma.integration.create({
          data: {
            workspaceId: req.ws!.workspaceId,
            provider: body.provider,
            projectId: body.projectId ?? null,
            config: body.config,
            enabled: body.enabled,
          },
        });
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'integration.saved', entity: 'integration', entityId: integration.id, meta: { provider: body.provider } });
    return created(res, integration);
  }),
);

integrationRouter.delete(
  '/:id',
  ...wsBase,
  ah(async (req, res) => {
    const { count } = await prisma.integration.deleteMany({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (count === 0) throw notFound('Integration not found');
    return ok(res, { message: 'Integration removed' });
  }),
);

/** Exposes the role matrix to any workspace member so the UI can explain itself. */
integrationRouter.get(
  '/roles',
  requireAuth,
  ah(async (_req, res) => {
    const roles = await prisma.role.findMany({ orderBy: { rank: 'desc' }, include: { permissions: { include: { permission: true } } } });
    return ok(
      res,
      ROLES.map((key) => {
        const row = roles.find((r) => r.key === key);
        return {
          key,
          name: row?.name ?? key,
          description: row?.description ?? '',
          permissions: row?.permissions.map((p) => p.permission.key) ?? [],
        };
      }),
    );
  }),
);
