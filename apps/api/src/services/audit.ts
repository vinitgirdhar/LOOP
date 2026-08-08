import type { Request } from 'express';
import { prisma } from '@loop/db';
import { SOCKET_EVENTS } from '@loop/shared';
import { emitTo, roomProject, roomWorkspace } from '../realtime/io.js';
import { logger } from '../lib/logger.js';

interface AuditInput {
  req?: Request;
  workspaceId?: string | null;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

/** Every privileged action lands here. Failures never break the request. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        actorId: input.actorId ?? input.req?.user?.id ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        meta: (input.meta ?? {}) as never,
        ip: input.req?.ip ?? null,
        userAgent: input.req?.get('user-agent')?.slice(0, 250) ?? null,
      },
    });
  } catch (error: unknown) {
    logger.warn('audit write failed', error instanceof Error ? error.message : error);
  }
}

interface ActivityInput {
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
  actorId?: string | null;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
}

/** Human-readable project timeline. Also feeds the Auto-Pilot rules engine. */
export async function activity(input: ActivityInput) {
  try {
    const row = await prisma.activityLog.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        actorId: input.actorId ?? null,
        type: input.type,
        message: input.message,
        meta: (input.meta ?? {}) as never,
      },
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });
    emitTo(input.projectId ? roomProject(input.projectId) : roomWorkspace(input.workspaceId), SOCKET_EVENTS.activity, row);
    return row;
  } catch (error: unknown) {
    logger.warn('activity write failed', error instanceof Error ? error.message : error);
    return null;
  }
}
