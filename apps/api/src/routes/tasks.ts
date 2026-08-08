import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma, type Prisma, type Task } from '@loop/db';
import { PRIORITIES, SOCKET_EVENTS, atLeast, can } from '@loop/shared';
import { ah, badRequest, created, forbidden, notFound, ok, pagination, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { cleanText, extractMentionHandles } from '../lib/sanitize.js';
import { activity, audit } from '../services/audit.js';
import { notify, resolveMentions } from '../services/notify.js';
import { upload } from '../middleware/upload.js';
import { storeFile } from '../lib/storage.js';
import { queueEmbedding } from '../services/rag.js';
import { runChatRules } from '../services/autopilot.js';
import {
  applyTaskUpdate,
  emitTask,
  fullTask,
  nextTaskNumber,
  taskInclude,
  taskUpdateSchema,
} from '../services/taskWrite.js';

export const taskRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

/** Loads a task inside the caller's workspace or throws 404. */
async function loadTask(taskId: string, workspaceId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId } });
  if (!task) throw notFound('Task not found');
  return task;
}

/** PM+ edit anything; members only their own tasks and only a safe subset of fields. */
const OWN_EDITABLE = new Set(['status', 'order', 'isBlocked', 'blockedNote', 'description', 'storyPoints', 'estimateHrs', 'startDate']);

function assertCanEdit(req: Request, task: Task, fields: string[]) {
  const role = req.ws!.role;
  if (can(role, 'task.update.any')) return;
  const mine = task.assigneeId === req.user!.id || task.reporterId === req.user!.id;
  if (!mine || !can(role, 'task.update.own')) throw forbidden('You can only edit tasks assigned to you');
  const illegal = fields.filter((f) => !OWN_EDITABLE.has(f));
  if (illegal.length > 0) throw forbidden(`Your role cannot change: ${illegal.join(', ')}`);
}

// ───────────────────────── list ─────────────────────────

taskRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 50);
    const q = req.query;

    const visibleProjects = atLeast(req.ws!.role, 'PM')
      ? undefined
      : (await prisma.projectMember.findMany({ where: { userId: req.user!.id, project: { workspaceId: req.ws!.workspaceId } }, select: { projectId: true } })).map((p) => p.projectId);

    const where: Prisma.TaskWhereInput = {
      workspaceId: req.ws!.workspaceId,
      ...(visibleProjects ? { projectId: { in: visibleProjects } } : {}),
      ...(q.projectId ? { projectId: String(q.projectId) } : {}),
      ...(q.sprintId ? { sprintId: q.sprintId === 'none' ? null : String(q.sprintId) } : {}),
      ...(q.assigneeId ? { assigneeId: q.assigneeId === 'me' ? req.user!.id : String(q.assigneeId) } : {}),
      ...(q.status ? { status: { in: String(q.status).split(',') } } : {}),
      ...(q.priority ? { priority: { in: String(q.priority).split(',') as never } } : {}),
      ...(q.blocked === 'true' ? { isBlocked: true } : {}),
      ...(q.open === 'true' ? { completedAt: null } : {}),
      ...(q.dueBefore ? { dueDate: { lte: new Date(String(q.dueBefore)) } } : {}),
      ...(q.q ? { OR: [{ title: { contains: String(q.q), mode: 'insensitive' } }, { description: { contains: String(q.q), mode: 'insensitive' } }] } : {}),
      ...(q.label ? { labels: { some: { label: { name: String(q.label) } } } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, key: true, name: true, color: true } },
          labels: { include: { label: true } },
          _count: { select: { comments: true, subtasks: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return ok(res, rows.map((t) => ({ ...t, labels: t.labels.map((l) => l.label) })), { total, page, limit });
  }),
);

taskRouter.get(
  '/:id',
  ...base,
  ah(async (req, res) => {
    await loadTask(req.params.id, req.ws!.workspaceId);
    return ok(res, await fullTask(req.params.id));
  }),
);

// ───────────────────────── create ─────────────────────────

taskRouter.post(
  '/',
  ...base,
  requirePermission('task.create'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        projectId: z.string(),
        title: z.string().min(2).max(200),
        description: z.string().max(10_000).optional(),
        status: z.string().max(40).optional(),
        priority: z.enum(PRIORITIES).default('MEDIUM'),
        assigneeId: z.string().nullable().optional(),
        sprintId: z.string().nullable().optional(),
        milestoneId: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
        dueDate: z.coerce.date().nullable().optional(),
        startDate: z.coerce.date().nullable().optional(),
        storyPoints: z.number().int().min(0).max(100).nullable().optional(),
        estimateHrs: z.number().min(0).max(500).nullable().optional(),
        recurrence: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
        labelIds: z.array(z.string()).default([]),
        checklist: z.array(z.string().max(200)).default([]),
      }),
      req.body,
    );

    const project = await prisma.project.findFirst({
      where: { id: body.projectId, workspaceId: req.ws!.workspaceId },
      include: { columns: { orderBy: { order: 'asc' } } },
    });
    if (!project) throw notFound('Project not found');
    if (body.assigneeId && !can(req.ws!.role, 'task.assign') && body.assigneeId !== req.user!.id) {
      throw forbidden('Your role cannot assign tasks to other people');
    }

    const status = body.status && project.columns.some((c) => c.key === body.status) ? body.status : project.columns[0]!.key;
    const first = await prisma.task.findFirst({ where: { projectId: project.id, status }, orderBy: { order: 'asc' }, select: { order: true } });

    const task = await prisma.task.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId: project.id,
        number: await nextTaskNumber(project.id),
        title: cleanText(body.title),
        description: body.description ? cleanText(body.description) : null,
        status,
        priority: body.priority,
        assigneeId: body.assigneeId ?? null,
        reporterId: req.user!.id,
        sprintId: body.sprintId ?? null,
        milestoneId: body.milestoneId ?? null,
        parentId: body.parentId ?? null,
        dueDate: body.dueDate ?? null,
        startDate: body.startDate ?? null,
        storyPoints: body.storyPoints ?? null,
        estimateHrs: body.estimateHrs ?? null,
        recurrence: body.recurrence ?? null,
        order: (first?.order ?? 1000) - 100,
        labels: { create: body.labelIds.map((labelId) => ({ labelId })) },
        subtasks: { create: body.checklist.map((title, order) => ({ title: cleanText(title), order })) },
      },
      include: taskInclude,
    });

    const shaped = { ...task, labels: task.labels.map((l) => l.label) };
    emitTask(project.id, SOCKET_EVENTS.taskCreate, shaped);
    await activity({
      workspaceId: req.ws!.workspaceId,
      projectId: project.id,
      taskId: task.id,
      actorId: req.user!.id,
      type: 'task.created',
      message: `${req.user!.name} created ${project.key}-${task.number}: ${task.title}`,
    });
    if (task.assigneeId) {
      await notify({
        workspaceId: req.ws!.workspaceId,
        userIds: [task.assigneeId],
        actorId: req.user!.id,
        type: 'TASK_ASSIGNED',
        title: `${project.key}-${task.number} assigned to you`,
        body: task.title,
        link: `/w/${req.ws!.workspaceId}/tasks/${task.id}`,
      });
    }
    void queueEmbedding({ workspaceId: req.ws!.workspaceId, projectId: project.id, sourceType: 'task', sourceId: task.id });

    return created(res, shaped);
  }),
);

// ───────────────────────── update ─────────────────────────

taskRouter.patch(
  '/:id',
  ...base,
  ah(async (req, res) => {
    const body = parse(taskUpdateSchema, req.body);
    const existing = await loadTask(req.params.id, req.ws!.workspaceId);
    assertCanEdit(req, existing, Object.keys(body));
    if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId && !can(req.ws!.role, 'task.assign')) {
      throw forbidden('Your role cannot reassign tasks');
    }

    const updated = await applyTaskUpdate(existing, body, {
      workspaceId: req.ws!.workspaceId,
      actorId: req.user!.id,
      actorName: req.user!.name,
    });
    return ok(res, updated);
  }),
);

// ───────────────────────── move (drag & drop) ─────────────────────────

taskRouter.post(
  '/:id/move',
  ...base,
  ah(async (req, res) => {
    const body = parse(z.object({ status: z.string(), index: z.number().int().min(0).default(0) }), req.body);
    const existing = await loadTask(req.params.id, req.ws!.workspaceId);
    assertCanEdit(req, existing, ['status', 'order']);

    const siblings = await prisma.task.findMany({
      where: { projectId: existing.projectId, status: body.status, id: { not: existing.id }, parentId: null },
      orderBy: { order: 'asc' },
      select: { order: true },
    });
    const before = siblings[body.index - 1]?.order;
    const after = siblings[body.index]?.order;
    const order =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : after !== undefined
          ? after - 100
          : before !== undefined
            ? before + 100
            : 1000;

    const updated = await applyTaskUpdate(existing, { status: body.status, order }, {
      workspaceId: req.ws!.workspaceId,
      actorId: req.user!.id,
      actorName: req.user!.name,
    });
    return ok(res, updated);
  }),
);

// ───────────────────────── bulk ─────────────────────────

taskRouter.post(
  '/bulk',
  ...base,
  requirePermission('task.update.any'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        ids: z.array(z.string()).min(1).max(200),
        action: z.enum(['status', 'assignee', 'priority', 'sprint', 'label', 'delete']),
        value: z.string().nullable().optional(),
      }),
      req.body,
    );

    const tasks = await prisma.task.findMany({ where: { id: { in: body.ids }, workspaceId: req.ws!.workspaceId } });
    if (tasks.length === 0) throw notFound('No matching tasks');

    if (body.action === 'delete') {
      if (!can(req.ws!.role, 'task.delete')) throw forbidden('Your role cannot delete tasks');
      await prisma.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
      for (const t of tasks) emitTask(t.projectId, SOCKET_EVENTS.taskDelete, { id: t.id, projectId: t.projectId });
      await audit({ req, workspaceId: req.ws!.workspaceId, action: 'task.bulk_deleted', entity: 'task', meta: { count: tasks.length } });
      return ok(res, { updated: tasks.length });
    }

    if (body.action === 'label') {
      if (!body.value) throw badRequest('Pick a label');
      await prisma.taskLabel.createMany({
        data: tasks.map((t) => ({ taskId: t.id, labelId: body.value! })),
        skipDuplicates: true,
      });
      return ok(res, { updated: tasks.length });
    }

    const patchKey = { status: 'status', assignee: 'assigneeId', priority: 'priority', sprint: 'sprintId' }[body.action];
    for (const task of tasks) {
      await applyTaskUpdate(task, { [patchKey]: body.value ?? null } as never, {
        workspaceId: req.ws!.workspaceId,
        actorId: req.user!.id,
        actorName: req.user!.name,
      });
    }
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'task.bulk_updated', entity: 'task', meta: { count: tasks.length, action: body.action } });
    return ok(res, { updated: tasks.length });
  }),
);

// ───────────────────────── delete ─────────────────────────

taskRouter.delete(
  '/:id',
  ...base,
  requirePermission('task.delete'),
  ah(async (req, res) => {
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    await prisma.task.delete({ where: { id: task.id } });
    emitTask(task.projectId, SOCKET_EVENTS.taskDelete, { id: task.id, projectId: task.projectId });
    await audit({ req, workspaceId: req.ws!.workspaceId, action: 'task.deleted', entity: 'task', entityId: task.id });
    return ok(res, { message: 'Task deleted' });
  }),
);

// ───────────────────────── subtasks / checklist ─────────────────────────

taskRouter.post(
  '/:id/subtasks',
  ...base,
  ah(async (req, res) => {
    const { title } = parse(z.object({ title: z.string().min(1).max(200) }), req.body);
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    assertCanEdit(req, task, ['status']);
    const last = await prisma.subtask.findFirst({ where: { taskId: task.id }, orderBy: { order: 'desc' } });
    const subtask = await prisma.subtask.create({
      data: { taskId: task.id, title: cleanText(title), order: (last?.order ?? -1) + 1 },
    });
    await prisma.task.update({ where: { id: task.id }, data: { lastActivityAt: new Date() } });
    emitTask(task.projectId, SOCKET_EVENTS.taskUpdate, await fullTask(task.id));
    return created(res, subtask);
  }),
);

taskRouter.patch(
  '/:id/subtasks/:subtaskId',
  ...base,
  ah(async (req, res) => {
    const body = parse(z.object({ title: z.string().min(1).max(200).optional(), done: z.boolean().optional() }), req.body);
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    assertCanEdit(req, task, ['status']);
    const { count } = await prisma.subtask.updateMany({ where: { id: req.params.subtaskId, taskId: task.id }, data: body });
    if (count === 0) throw notFound('Checklist item not found');
    emitTask(task.projectId, SOCKET_EVENTS.taskUpdate, await fullTask(task.id));
    return ok(res, await prisma.subtask.findUnique({ where: { id: req.params.subtaskId } }));
  }),
);

taskRouter.delete(
  '/:id/subtasks/:subtaskId',
  ...base,
  ah(async (req, res) => {
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    assertCanEdit(req, task, ['status']);
    await prisma.subtask.deleteMany({ where: { id: req.params.subtaskId, taskId: task.id } });
    return ok(res, { message: 'Removed' });
  }),
);

// ───────────────────────── dependencies ─────────────────────────

taskRouter.post(
  '/:id/dependencies',
  ...base,
  requirePermission('task.update.any'),
  ah(async (req, res) => {
    const { blockerId } = parse(z.object({ blockerId: z.string() }), req.body);
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    if (blockerId === task.id) throw badRequest('A task cannot block itself');
    await loadTask(blockerId, req.ws!.workspaceId);

    // Reject cycles by walking the existing chain upwards.
    const seen = new Set<string>([task.id]);
    let frontier = [blockerId];
    while (frontier.length > 0) {
      if (frontier.some((id) => seen.has(id))) throw badRequest('That would create a circular dependency');
      frontier.forEach((id) => seen.add(id));
      const next = await prisma.taskDependency.findMany({ where: { blockedId: { in: frontier } }, select: { blockerId: true } });
      frontier = next.map((n) => n.blockerId);
    }

    const dep = await prisma.taskDependency.create({ data: { blockerId, blockedId: task.id } });
    emitTask(task.projectId, SOCKET_EVENTS.taskUpdate, await fullTask(task.id));
    return created(res, dep);
  }),
);

taskRouter.delete(
  '/:id/dependencies/:depId',
  ...base,
  requirePermission('task.update.any'),
  ah(async (req, res) => {
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    await prisma.taskDependency.deleteMany({ where: { id: req.params.depId, blockedId: task.id } });
    emitTask(task.projectId, SOCKET_EVENTS.taskUpdate, await fullTask(task.id));
    return ok(res, { message: 'Dependency removed' });
  }),
);

// ───────────────────────── labels ─────────────────────────

taskRouter.post(
  '/:id/labels',
  ...base,
  ah(async (req, res) => {
    const { labelId } = parse(z.object({ labelId: z.string() }), req.body);
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    assertCanEdit(req, task, ['status']);
    await prisma.taskLabel.createMany({ data: [{ taskId: task.id, labelId }], skipDuplicates: true });
    return ok(res, await fullTask(task.id));
  }),
);

taskRouter.delete(
  '/:id/labels/:labelId',
  ...base,
  ah(async (req, res) => {
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    assertCanEdit(req, task, ['status']);
    await prisma.taskLabel.deleteMany({ where: { taskId: task.id, labelId: req.params.labelId } });
    return ok(res, await fullTask(task.id));
  }),
);

// ───────────────────────── comments ─────────────────────────

taskRouter.get(
  '/:id/comments',
  ...base,
  ah(async (req, res) => {
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    const comments = await prisma.comment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return ok(res, comments);
  }),
);

taskRouter.post(
  '/:id/comments',
  ...base,
  requirePermission('task.comment'),
  ah(async (req, res) => {
    const { body: text } = parse(z.object({ body: z.string().min(1).max(5000) }), req.body);
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    const clean = cleanText(text);
    const mentionIds = await resolveMentions(req.ws!.workspaceId, extractMentionHandles(clean));

    const comment = await prisma.comment.create({
      data: { workspaceId: req.ws!.workspaceId, taskId: task.id, authorId: req.user!.id, body: clean, mentions: mentionIds },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await prisma.task.update({ where: { id: task.id }, data: { lastActivityAt: new Date() } });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId }, select: { key: true } });
    const watchers = [task.assigneeId, task.reporterId].filter((v): v is string => Boolean(v));

    await notify({
      workspaceId: req.ws!.workspaceId,
      userIds: watchers,
      actorId: req.user!.id,
      type: 'COMMENT_ADDED',
      title: `New comment on ${project.key}-${task.number}`,
      body: clean.slice(0, 140),
      link: `/w/${req.ws!.workspaceId}/tasks/${task.id}`,
    });
    if (mentionIds.length > 0) {
      await notify({
        workspaceId: req.ws!.workspaceId,
        userIds: mentionIds,
        actorId: req.user!.id,
        type: 'MENTION',
        title: `${req.user!.name} mentioned you on ${project.key}-${task.number}`,
        body: clean.slice(0, 140),
        link: `/w/${req.ws!.workspaceId}/tasks/${task.id}`,
      });
    }
    await activity({
      workspaceId: req.ws!.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: req.user!.id,
      type: 'comment.added',
      message: `${req.user!.name} commented on ${project.key}-${task.number}`,
    });

    // Auto-Pilot reads comments too — "I'm stuck on X" proposes a blocked flag.
    void runChatRules({
      workspaceId: req.ws!.workspaceId,
      projectId: task.projectId,
      authorName: req.user!.name,
      text: clean,
      sourceLabel: `comment on ${project.key}-${task.number}`,
      sourceUrl: `/w/${req.ws!.workspaceId}/tasks/${task.id}`,
      hintTaskId: task.id,
    });
    void queueEmbedding({ workspaceId: req.ws!.workspaceId, projectId: task.projectId, sourceType: 'comment', sourceId: comment.id });

    return created(res, comment);
  }),
);

taskRouter.delete(
  '/:id/comments/:commentId',
  ...base,
  ah(async (req, res) => {
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    const comment = await prisma.comment.findFirst({ where: { id: req.params.commentId, taskId: task.id } });
    if (!comment) throw notFound('Comment not found');
    if (comment.authorId !== req.user!.id && !atLeast(req.ws!.role, 'PM')) throw forbidden('You can only delete your own comments');
    await prisma.comment.delete({ where: { id: comment.id } });
    return ok(res, { message: 'Comment deleted' });
  }),
);

// ───────────────────────── attachments ─────────────────────────

taskRouter.post(
  '/:id/attachments',
  ...base,
  requirePermission('file.upload'),
  upload.array('files', 5),
  ah(async (req, res) => {
    const task = await loadTask(req.params.id, req.ws!.workspaceId);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No files uploaded');

    const stored = await Promise.all(files.map((f) => storeFile(f, `tasks/${task.id}`)));
    await prisma.attachment.createMany({
      data: stored.map((s) => ({
        workspaceId: req.ws!.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        name: s.name,
        url: s.url,
        publicId: s.publicId,
        mime: s.mime,
        size: s.size,
        uploadedById: req.user!.id,
      })),
    });
    await prisma.task.update({ where: { id: task.id }, data: { lastActivityAt: new Date() } });

    await notify({
      workspaceId: req.ws!.workspaceId,
      userIds: [task.assigneeId, task.reporterId].filter((v): v is string => Boolean(v)),
      actorId: req.user!.id,
      type: 'FILE_UPLOADED',
      title: `${files.length} file(s) added to a task you follow`,
      link: `/w/${req.ws!.workspaceId}/tasks/${task.id}`,
    });

    return created(res, await fullTask(task.id));
  }),
);
