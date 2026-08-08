import { z } from 'zod';
import { prisma, type Prisma, type Task } from '@loop/db';
import { PRIORITIES, SOCKET_EVENTS } from '@loop/shared';
import { badRequest } from '../lib/http.js';
import { cleanText } from '../lib/sanitize.js';
import { emitTo, roomProject } from '../realtime/io.js';
import { activity } from './audit.js';
import { notify } from './notify.js';
import { queueEmbedding } from './rag.js';

/**
 * Every write to a task goes through applyTaskUpdate: REST, bulk actions and
 * accepted AI suggestions all share the same side effects (activity, sockets,
 * notifications, recurrence, re-embedding). Lives in a service rather than the
 * route file so the Auto-Pilot can use it without a circular import.
 */

export const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  reporter: { select: { id: true, name: true, avatarUrl: true } },
  project: { select: { id: true, key: true, name: true, color: true, workspaceId: true } },
  sprint: { select: { id: true, name: true, status: true } },
  milestone: { select: { id: true, title: true } },
  labels: { include: { label: true } },
  subtasks: { orderBy: { order: 'asc' } },
  children: {
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      completedAt: true,
      assignee: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  blockedBy: { include: { blocker: { select: { id: true, number: true, title: true, status: true, completedAt: true } } } },
  blocks: { include: { blocked: { select: { id: true, number: true, title: true, status: true } } } },
  attachments: { include: { uploadedBy: { select: { id: true, name: true } } } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

export const taskUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(10_000).nullable().optional(),
  status: z.string().max(40).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  estimateHrs: z.number().min(0).max(500).nullable().optional(),
  isBlocked: z.boolean().optional(),
  blockedNote: z.string().max(300).nullable().optional(),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
  order: z.number().optional(),
});

export type TaskPatch = z.infer<typeof taskUpdateSchema>;

export interface TaskActor {
  workspaceId: string;
  actorId: string | null;
  actorName: string;
}

export async function nextTaskNumber(projectId: string): Promise<number> {
  const last = await prisma.task.findFirst({ where: { projectId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

export async function fullTask(id: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  return { ...task, labels: task.labels.map((l) => l.label) };
}

export function emitTask(projectId: string, event: string, payload: unknown) {
  emitTo(roomProject(projectId), event, payload);
}

export async function applyTaskUpdate(existing: Task, patch: TaskPatch, actor: TaskActor) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: existing.projectId },
    select: { id: true, key: true, columns: true },
  });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const before = (existing as unknown as Record<string, unknown>)[key];
    const a = before instanceof Date ? before.toISOString() : before;
    const b = value instanceof Date ? value.toISOString() : value;
    if (a !== b) changes[key] = { from: a, to: b };
  }
  if (Object.keys(changes).length === 0) return fullTask(existing.id);

  let completedAt = existing.completedAt;
  if (patch.status && patch.status !== existing.status) {
    const column = project.columns.find((c) => c.key === patch.status);
    if (!column) throw badRequest('That column does not exist on this board');
    completedAt = column.isDone ? (existing.completedAt ?? new Date()) : null;
  }

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      ...patch,
      ...(patch.title ? { title: cleanText(patch.title) } : {}),
      ...(patch.description !== undefined ? { description: patch.description ? cleanText(patch.description) : null } : {}),
      completedAt,
      lastActivityAt: new Date(),
    },
    include: taskInclude,
  });

  const shaped = { ...task, labels: task.labels.map((l) => l.label) };
  emitTask(project.id, SOCKET_EVENTS.taskUpdate, shaped);

  if (changes.status) {
    const to = project.columns.find((c) => c.key === patch.status)?.name ?? patch.status;
    const from = project.columns.find((c) => c.key === existing.status)?.name ?? existing.status;
    await activity({
      workspaceId: actor.workspaceId,
      projectId: project.id,
      taskId: task.id,
      actorId: actor.actorId,
      type: 'task.moved',
      message: `${actor.actorName} moved ${project.key}-${task.number} from ${from} to ${to}`,
      meta: { from: existing.status, to: patch.status },
    });
    if (completedAt && !existing.completedAt) {
      await notify({
        workspaceId: actor.workspaceId,
        userIds: [existing.reporterId, existing.assigneeId].filter((v): v is string => Boolean(v)),
        actorId: actor.actorId,
        type: 'TASK_COMPLETED',
        title: `${project.key}-${task.number} is done`,
        body: task.title,
        link: `/w/${actor.workspaceId}/tasks/${task.id}`,
      });
      await spawnRecurrence(task);
    }
  }

  if (changes.assigneeId && task.assigneeId) {
    await notify({
      workspaceId: actor.workspaceId,
      userIds: [task.assigneeId],
      actorId: actor.actorId,
      type: 'TASK_ASSIGNED',
      title: `${project.key}-${task.number} assigned to you`,
      body: task.title,
      link: `/w/${actor.workspaceId}/tasks/${task.id}`,
    });
  }

  const meaningful = Object.keys(changes).filter((k) => k !== 'order' && k !== 'status');
  if (meaningful.length > 0) {
    await activity({
      workspaceId: actor.workspaceId,
      projectId: project.id,
      taskId: task.id,
      actorId: actor.actorId,
      type: 'task.updated',
      message: `${actor.actorName} updated ${project.key}-${task.number} (${meaningful.join(', ')})`,
      meta: changes,
    });
  }

  if (changes.title || changes.description) {
    void queueEmbedding({ workspaceId: actor.workspaceId, projectId: project.id, sourceType: 'task', sourceId: task.id });
  }

  return shaped;
}

/** A completed recurring task immediately clones itself for the next cycle. */
async function spawnRecurrence(task: Task) {
  if (!task.recurrence) return;
  if (task.recurUntil && task.recurUntil < new Date()) return;
  const step = { daily: 1, weekly: 7, monthly: 30 }[task.recurrence];
  if (!step) return;

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: task.projectId },
    select: { columns: { orderBy: { order: 'asc' } } },
  });

  await prisma.task.create({
    data: {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      number: await nextTaskNumber(task.projectId),
      title: task.title,
      description: task.description,
      status: project.columns[0]!.key,
      priority: task.priority,
      assigneeId: task.assigneeId,
      reporterId: task.reporterId,
      storyPoints: task.storyPoints,
      estimateHrs: task.estimateHrs,
      dueDate: task.dueDate ? new Date(task.dueDate.getTime() + step * 86_400_000) : null,
      recurrence: task.recurrence,
      recurUntil: task.recurUntil,
      order: 1000,
    },
  });
}
