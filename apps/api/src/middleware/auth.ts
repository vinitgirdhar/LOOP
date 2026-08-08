import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '@loop/db';
import { can, type Permission, type Role, atLeast } from '@loop/shared';
import { verifyAccessToken } from '../lib/crypto.js';
import { forbidden, notFound, unauthorized } from '../lib/http.js';

function bearer(req: Request): string | null {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Verifies the access token and confirms the session is still alive. */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = bearer(req);
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(unauthorized('Session expired'));
  }

  prisma.session
    .findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, user: { select: { id: true, email: true, name: true, isPlatformAdmin: true, isSuspended: true } } },
    })
    .then((session) => {
      if (!session || session.revokedAt || session.expiresAt < new Date()) return next(unauthorized('Session revoked'));
      if (session.user.isSuspended) return next(forbidden('This account is suspended'));
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        isPlatformAdmin: session.user.isPlatformAdmin,
        sessionId: payload.sid,
      };
      next();
    })
    .catch(next);
};

export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!req.user.isPlatformAdmin) return next(forbidden('Platform admin only'));
  next();
};

function workspaceIdFrom(req: Request): string | null {
  return (
    (req.params.workspaceId as string | undefined) ??
    (req.get('x-workspace-id') || undefined) ??
    (req.query.workspaceId as string | undefined) ??
    (typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, string>).workspaceId : undefined) ??
    null
  );
}

/**
 * Resolves the tenant for the request and the caller's role inside it.
 * Every business query downstream is scoped by req.ws.workspaceId.
 */
export function workspaceContext(required = true): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return required ? next(forbidden('Missing workspace context')) : next();

    prisma.workspaceMember
      .findUnique({
        where: { workspaceId_userId: { workspaceId, userId: req.user.id } },
        select: { id: true, role: true },
      })
      .then(async (member) => {
        if (member) {
          req.ws = { workspaceId, role: member.role as Role, memberId: member.id, viaAdmin: false };
          return next();
        }
        if (req.user!.isPlatformAdmin) {
          const exists = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
          if (!exists) return next(notFound('Workspace not found'));
          req.ws = { workspaceId, role: 'OWNER', memberId: null, viaAdmin: true };
          return next();
        }
        return next(forbidden('You are not a member of this workspace'));
      })
      .catch(next);
  };
}

export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.ws) return next(forbidden('Missing workspace context'));
    const allowed = permissions.some((p) => can(req.ws!.role, p));
    if (!allowed) return next(forbidden(`Your role (${req.ws.role}) cannot perform this action`));
    next();
  };
}

export function requireRole(minimum: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.ws) return next(forbidden('Missing workspace context'));
    if (!atLeast(req.ws.role, minimum)) return next(forbidden(`Requires ${minimum} or above`));
    next();
  };
}

/**
 * Confirms the project belongs to the caller's workspace and that they may see
 * it. PM/OWNER see every project; MEMBER and CLIENT only their own.
 */
export function projectAccess(param = 'projectId'): RequestHandler {
  return (req, _res, next) => {
    if (!req.ws || !req.user) return next(forbidden('Missing workspace context'));
    const projectId = (req.params[param] ?? req.body?.[param] ?? req.query[param]) as string | undefined;
    if (!projectId) return next(forbidden('Missing project id'));

    prisma.project
      .findFirst({
        where: { id: projectId, workspaceId: req.ws.workspaceId },
        select: { id: true, members: { where: { userId: req.user.id }, select: { id: true } } },
      })
      .then((project) => {
        if (!project) return next(notFound('Project not found'));
        const privileged = atLeast(req.ws!.role, 'PM');
        if (!privileged && project.members.length === 0) return next(forbidden('You are not on this project'));
        req.projectId = project.id;
        next();
      })
      .catch(next);
  };
}

/** Helper for handlers: throws unless the caller is authenticated + in a workspace. */
export function ctx(req: Request): { userId: string; workspaceId: string; role: Role } {
  if (!req.user || !req.ws) throw unauthorized();
  return { userId: req.user.id, workspaceId: req.ws.workspaceId, role: req.ws.role };
}

export type { NextFunction, Response };
