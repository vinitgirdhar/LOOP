import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@loop/db';
import { DEFAULT_COLUMNS, PRIORITIES, PROJECT_STATUSES, atLeast } from '@loop/shared';
import { ah, badRequest, created, notFound, ok, parse } from '../lib/http.js';
import { projectAccess, requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { cleanText } from '../lib/sanitize.js';
import { activity, audit } from '../services/audit.js';
import { computeHealth } from '../services/health.js';

export const projectRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

const projectSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  status: true,
  priority: true,
  startDate: true,
  deadline: true,
  color: true,
  autoApply: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true, members: true, sprints: true } },
} satisfies Prisma.ProjectSelect;

/** Members and clients only see projects they belong to; PM and owner see all. */
async function visibleProjectFilter(workspaceId: string, userId: string, role: string): Promise<Prisma.ProjectWhereInput> {
  if (atLeast(role as never, 'PM')) return { workspaceId };
  return { workspaceId, members: { some: { userId } } };
}

// ───────────────────────── projects ─────────────────────────

projectRouter.post(
  '/',
  ...base,
  requirePermission('project.create'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80),
        key: z.string().min(2).max(8).regex(/^[A-Za-z][A-Za-z0-9]*$/, 'Key must be letters and numbers').optional(),
        description: z.string().max(2000).optional(),
        status: z.enum(PROJECT_STATUSES).default('ACTIVE'),
        priority: z.enum(PRIORITIES).default('MEDIUM'),
        startDate: z.coerce.date().optional(),
        deadline: z.coerce.date().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
        memberIds: z.array(z.string()).default([]),
      }),
      req.body,
    );

    const workspaceId = req.ws!.workspaceId;
    const key = (body.key ?? (body.name.replace(/[^A-Za-z]/g, '').slice(0, 4) || 'PROJ')).toUpperCase();

    const project = await prisma.$transaction(async (tx) => {
      const memberIds = [...new Set([req.user!.id, ...body.memberIds])];
      const valid = await tx.workspaceMember.findMany({
        where: { workspaceId, userId: { in: memberIds } },
        select: { userId: true },
      });
      const row = await tx.project.create({
        data: {
          workspaceId,
          key,
          name: cleanText(body.name),
          description: body.description ? cleanText(body.description) : null,
          status: body.status,
          priority: body.priority,
          startDate: body.startDate ?? null,
          deadline: body.deadline ?? null,
          color: body.color,
          columns: { create: DEFAULT_COLUMNS.map((c) => ({ ...c })) },
          members: {
            create: valid.map((m) => ({ userId: m.userId, role: m.userId === req.user!.id ? 'lead' : 'member' })),
          },
        },
        select: projectSelect,
      });
      await tx.channel.create({
        data: {
          workspaceId,
          projectId: row.id,
          name: `proj-${row.key.toLowerCase()}`,
          topic: `Discussion for ${row.name}`,
          members: { create: valid.map((m) => ({ userId: m.userId })) },
        },
      });
      return row;
    });

    await activity({
      workspaceId,
      projectId: project.id,
      actorId: req.user!.id,
      type: 'project.created',
      message: `${req.user!.name} created project ${project.name}`,
    });
    await audit({ req, workspaceId, action: 'project.created', entity: 'project', entityId: project.id });
    return created(res, project);
  }),
);

projectRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const where = await visibleProjectFilter(req.ws!.workspaceId, req.user!.id, req.ws!.role);
    const status = req.query.status ? String(req.query.status) : undefined;
    const projects = await prisma.project.findMany({
      where: { ...where, ...(status ? { status: status as never } : {}), archivedAt: null },
      select: {
        ...projectSelect,
        members: { select: { user: { select: { id: true, name: true, avatarUrl: true } } }, take: 6 },
        health: { orderBy: { createdAt: 'desc' }, take: 1, select: { score: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const withProgress = await Promise.all(
      projects.map(async (p) => {
        const [done, total] = await Promise.all([
          prisma.task.count({ where: { projectId: p.id, completedAt: { not: null } } }),
          prisma.task.count({ where: { projectId: p.id } }),
        ]);
        return { ...p, progress: total === 0 ? 0 : Math.round((done / total) * 100), doneCount: done, taskCount: total };
      }),
    );
    return ok(res, withProgress);
  }),
);

projectRouter.get(
  '/:projectId',
  ...base,
  projectAccess(),
  ah(async (req, res) => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: req.projectId },
      include: {
        columns: { orderBy: { order: 'asc' } },
        members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
        milestones: { orderBy: { dueDate: 'asc' } },
        sprints: { orderBy: { startDate: 'desc' }, take: 5 },
        labels: true,
        _count: { select: { tasks: true, wikiPages: true, attachments: true } },
      },
    });
    return ok(res, project);
  }),
);

projectRouter.patch(
  '/:projectId',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(2000).nullable().optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        startDate: z.coerce.date().nullable().optional(),
        deadline: z.coerce.date().nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        autoApply: z.boolean().optional(),
      }),
      req.body,
    );
    const project = await prisma.project.update({
      where: { id: req.projectId },
      data: { ...body, ...(body.name ? { name: cleanText(body.name) } : {}) },
      select: projectSelect,
    });
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'project.updated', entity: 'project', entityId: project.id, meta: body });
    return ok(res, project);
  }),
);

projectRouter.delete(
  '/:projectId',
  ...base,
  projectAccess(),
  requirePermission('project.delete'),
  ah(async (req, res) => {
    const archive = req.query.hard !== 'true';
    if (archive) {
      await prisma.project.update({ where: { id: req.projectId }, data: { archivedAt: new Date(), status: 'ARCHIVED' } });
    } else {
      await prisma.project.delete({ where: { id: req.projectId } });
    }
    await audit({ req, workspaceId: req.ws!.workspaceId, action: archive ? 'project.archived' : 'project.deleted', entity: 'project', entityId: req.projectId });
    return ok(res, { message: archive ? 'Project archived' : 'Project deleted' });
  }),
);

// ───────────────────────── board ─────────────────────────

projectRouter.get(
  '/:projectId/board',
  ...base,
  projectAccess(),
  ah(async (req, res) => {
    const sprintId = req.query.sprintId ? String(req.query.sprintId) : undefined;
    const assigneeId = req.query.assigneeId ? String(req.query.assigneeId) : undefined;

    const [columns, tasks] = await Promise.all([
      prisma.boardColumn.findMany({ where: { projectId: req.projectId }, orderBy: { order: 'asc' } }),
      prisma.task.findMany({
        where: {
          projectId: req.projectId,
          parentId: null,
          ...(sprintId ? { sprintId: sprintId === 'backlog' ? null : sprintId } : {}),
          ...(assigneeId ? { assigneeId } : {}),
        },
        orderBy: [{ order: 'asc' }],
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          labels: { include: { label: true } },
          _count: { select: { comments: true, subtasks: true, attachments: true, children: true } },
          subtasks: { select: { done: true } },
        },
      }),
    ]);

    const shaped = tasks.map((t) => ({
      ...t,
      labels: t.labels.map((l) => l.label),
      checklistDone: t.subtasks.filter((s) => s.done).length,
      checklistTotal: t.subtasks.length,
      subtasks: undefined,
    }));

    return ok(res, { columns, tasks: shaped });
  }),
);

// ───────────────────────── columns ─────────────────────────

projectRouter.post(
  '/:projectId/columns',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(1).max(40),
        isDone: z.boolean().default(false),
        wipLimit: z.number().int().min(1).max(50).nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#94a3b8'),
      }),
      req.body,
    );
    const last = await prisma.boardColumn.findFirst({ where: { projectId: req.projectId }, orderBy: { order: 'desc' } });
    const key = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36).slice(-4)}`;
    const column = await prisma.boardColumn.create({
      data: {
        projectId: req.projectId!,
        key,
        name: cleanText(body.name),
        order: (last?.order ?? -1) + 1,
        isDone: body.isDone,
        wipLimit: body.wipLimit ?? null,
        color: body.color,
      },
    });
    return created(res, column);
  }),
);

projectRouter.patch(
  '/:projectId/columns/:id',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(1).max(40).optional(),
        order: z.number().int().min(0).optional(),
        isDone: z.boolean().optional(),
        wipLimit: z.number().int().min(1).max(50).nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      }),
      req.body,
    );
    const { count } = await prisma.boardColumn.updateMany({
      where: { id: req.params.id, projectId: req.projectId },
      data: body,
    });
    if (count === 0) throw notFound('Column not found');
    return ok(res, await prisma.boardColumn.findUnique({ where: { id: req.params.id } }));
  }),
);

projectRouter.delete(
  '/:projectId/columns/:id',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const columns = await prisma.boardColumn.findMany({ where: { projectId: req.projectId }, orderBy: { order: 'asc' } });
    if (columns.length <= 2) throw badRequest('A board needs at least two columns');
    const column = columns.find((c) => c.id === req.params.id);
    if (!column) throw notFound('Column not found');
    const fallback = columns.find((c) => c.id !== column.id)!;

    await prisma.$transaction([
      prisma.task.updateMany({ where: { projectId: req.projectId, status: column.key }, data: { status: fallback.key } }),
      prisma.boardColumn.delete({ where: { id: column.id } }),
    ]);
    return ok(res, { message: `Column deleted, tasks moved to ${fallback.name}` });
  }),
);

// ───────────────────────── members ─────────────────────────

projectRouter.post(
  '/:projectId/members',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const body = parse(z.object({ userId: z.string(), role: z.enum(['lead', 'member', 'viewer']).default('member') }), req.body);
    const isMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: req.ws!.workspaceId, userId: body.userId } },
    });
    if (!isMember) throw badRequest('That person is not in this workspace');

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: req.projectId!, userId: body.userId } },
      create: { projectId: req.projectId!, userId: body.userId, role: body.role },
      update: { role: body.role },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    const channel = await prisma.channel.findFirst({ where: { projectId: req.projectId } });
    if (channel) {
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId: body.userId } },
        create: { channelId: channel.id, userId: body.userId },
        update: {},
      });
    }
    return created(res, member);
  }),
);

projectRouter.delete(
  '/:projectId/members/:userId',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const { count } = await prisma.projectMember.deleteMany({ where: { projectId: req.projectId, userId: req.params.userId } });
    if (count === 0) throw notFound('Not a project member');
    return ok(res, { message: 'Removed from project' });
  }),
);

// ───────────────────────── milestones ─────────────────────────

projectRouter.post(
  '/:projectId/milestones',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ title: z.string().min(2).max(120), description: z.string().max(500).optional(), dueDate: z.coerce.date().optional() }),
      req.body,
    );
    const milestone = await prisma.milestone.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId: req.projectId!,
        title: cleanText(body.title),
        description: body.description ? cleanText(body.description) : null,
        dueDate: body.dueDate ?? null,
      },
    });
    return created(res, milestone);
  }),
);

projectRouter.patch(
  '/:projectId/milestones/:id',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        title: z.string().min(2).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        dueDate: z.coerce.date().nullable().optional(),
        completed: z.boolean().optional(),
      }),
      req.body,
    );
    const { completed, ...rest } = body;
    const { count } = await prisma.milestone.updateMany({
      where: { id: req.params.id, projectId: req.projectId },
      data: { ...rest, ...(completed === undefined ? {} : { completedAt: completed ? new Date() : null }) },
    });
    if (count === 0) throw notFound('Milestone not found');
    return ok(res, await prisma.milestone.findUnique({ where: { id: req.params.id } }));
  }),
);

projectRouter.delete(
  '/:projectId/milestones/:id',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const { count } = await prisma.milestone.deleteMany({ where: { id: req.params.id, projectId: req.projectId } });
    if (count === 0) throw notFound('Milestone not found');
    return ok(res, { message: 'Milestone deleted' });
  }),
);

// ───────────────────────── labels ─────────────────────────

projectRouter.post(
  '/:projectId/labels',
  ...base,
  projectAccess(),
  requirePermission('project.update', 'task.create'),
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().min(1).max(30), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#64748b') }), req.body);
    const label = await prisma.label.create({
      data: { workspaceId: req.ws!.workspaceId, projectId: req.projectId!, name: cleanText(body.name), color: body.color },
    });
    return created(res, label);
  }),
);

projectRouter.delete(
  '/:projectId/labels/:id',
  ...base,
  projectAccess(),
  requirePermission('project.update'),
  ah(async (req, res) => {
    const { count } = await prisma.label.deleteMany({ where: { id: req.params.id, projectId: req.projectId } });
    if (count === 0) throw notFound('Label not found');
    return ok(res, { message: 'Label deleted' });
  }),
);

// ───────────────────────── health score ─────────────────────────

projectRouter.get(
  '/:projectId/health',
  ...base,
  projectAccess(),
  ah(async (req, res) => {
    const refresh = req.query.refresh === 'true';
    const health = await computeHealth(req.projectId!, { persist: refresh, narrate: refresh });
    return ok(res, health);
  }),
);

projectRouter.get(
  '/:projectId/health/history',
  ...base,
  projectAccess(),
  ah(async (req, res) => {
    const rows = await prisma.healthSnapshot.findMany({
      where: { projectId: req.projectId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { score: true, createdAt: true },
    });
    return ok(res, rows.reverse());
  }),
);
