import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { ah, badRequest, created, notFound, ok, pagination, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { deleteFile, storeFile } from '../lib/storage.js';
import { cleanText } from '../lib/sanitize.js';
import { activity } from '../services/audit.js';
import { notify } from '../services/notify.js';

export const fileRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

fileRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const { page, limit, skip, take } = pagination(req.query, 40);
    const where = {
      workspaceId: req.ws!.workspaceId,
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
      ...(req.query.folderId ? { folderId: String(req.query.folderId) } : req.query.root === 'true' ? { folderId: null } : {}),
      ...(req.query.q ? { name: { contains: String(req.query.q), mode: 'insensitive' as const } } : {}),
      // Only the newest version of each file is listed; older ones hang off replacesId.
      replacedBy: { is: null },
    };
    const [files, total] = await Promise.all([
      prisma.attachment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } }, folder: { select: { id: true, name: true } } },
      }),
      prisma.attachment.count({ where }),
    ]);
    return ok(res, files, { total, page, limit });
  }),
);

fileRouter.get(
  '/folders',
  ...base,
  ah(async (req, res) => {
    const folders = await prisma.folder.findMany({
      where: {
        workspaceId: req.ws!.workspaceId,
        ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { files: true, children: true } } },
    });
    return ok(res, folders);
  }),
);

fileRouter.post(
  '/folders',
  ...base,
  requirePermission('file.upload'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ name: z.string().min(1).max(80), projectId: z.string().nullable().optional(), parentId: z.string().nullable().optional() }),
      req.body,
    );
    const folder = await prisma.folder.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId: body.projectId ?? null,
        parentId: body.parentId ?? null,
        name: cleanText(body.name),
      },
    });
    return created(res, folder);
  }),
);

fileRouter.delete(
  '/folders/:id',
  ...base,
  requirePermission('file.delete'),
  ah(async (req, res) => {
    const { count } = await prisma.folder.deleteMany({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (count === 0) throw notFound('Folder not found');
    return ok(res, { message: 'Folder deleted' });
  }),
);

fileRouter.post(
  '/',
  ...base,
  requirePermission('file.upload'),
  uploadLimiter,
  upload.array('files', 5),
  ah(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No files uploaded');

    const projectId = req.body.projectId ? String(req.body.projectId) : null;
    const folderId = req.body.folderId ? String(req.body.folderId) : null;
    const replacesId = req.body.replacesId ? String(req.body.replacesId) : null;

    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: req.ws!.workspaceId } });
      if (!project) throw notFound('Project not found');
    }

    let version = 1;
    if (replacesId) {
      const previous = await prisma.attachment.findFirst({ where: { id: replacesId, workspaceId: req.ws!.workspaceId } });
      if (!previous) throw notFound('The file you are replacing does not exist');
      version = previous.version + 1;
    }

    const stored = await Promise.all(files.map((f) => storeFile(f, `workspaces/${req.ws!.workspaceId}/files`)));
    const rows = await Promise.all(
      stored.map((s, index) =>
        prisma.attachment.create({
          data: {
            workspaceId: req.ws!.workspaceId,
            projectId,
            folderId,
            name: s.name,
            url: s.url,
            publicId: s.publicId,
            mime: s.mime,
            size: s.size,
            version,
            replacesId: index === 0 ? replacesId : null,
            uploadedById: req.user!.id,
          },
          include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
        }),
      ),
    );

    if (projectId) {
      await activity({
        workspaceId: req.ws!.workspaceId,
        projectId,
        actorId: req.user!.id,
        type: 'file.uploaded',
        message: `${req.user!.name} uploaded ${rows.map((r) => r.name).join(', ')}`,
      });
      const members = await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } });
      await notify({
        workspaceId: req.ws!.workspaceId,
        userIds: members.map((m) => m.userId),
        actorId: req.user!.id,
        type: 'FILE_UPLOADED',
        title: `${req.user!.name} uploaded ${rows.length} file(s)`,
        link: `/w/${req.ws!.workspaceId}/files`,
      });
    }

    return created(res, rows);
  }),
);

fileRouter.get(
  '/:id/versions',
  ...base,
  ah(async (req, res) => {
    const chain: unknown[] = [];
    let current = await prisma.attachment.findFirst({
      where: { id: req.params.id, workspaceId: req.ws!.workspaceId },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    if (!current) throw notFound('File not found');

    while (current) {
      chain.push(current);
      if (!current.replacesId) break;
      current = await prisma.attachment.findUnique({
        where: { id: current.replacesId },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
    }
    return ok(res, chain);
  }),
);

fileRouter.delete(
  '/:id',
  ...base,
  requirePermission('file.delete'),
  ah(async (req, res) => {
    const file = await prisma.attachment.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!file) throw notFound('File not found');
    await prisma.attachment.delete({ where: { id: file.id } });
    await deleteFile(file.publicId, file.url);
    return ok(res, { message: 'File deleted' });
  }),
);
