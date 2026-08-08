import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { ah, created, forbidden, notFound, ok, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { cleanRichText, cleanText } from '../lib/sanitize.js';
import { activity } from '../services/audit.js';
import { queueEmbedding } from '../services/rag.js';

export const wikiRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';

/** Clients only ever see pages explicitly marked as shared. */
const visibilityFilter = (role: string) => (role === 'CLIENT' ? { isShared: true } : {});

wikiRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const pages = await prisma.wikiPage.findMany({
      where: {
        workspaceId: req.ws!.workspaceId,
        ...(projectId ? { projectId } : {}),
        ...visibilityFilter(req.ws!.role),
        ...(req.query.q
          ? {
              OR: [
                { title: { contains: String(req.query.q), mode: 'insensitive' } },
                { content: { contains: String(req.query.q), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ parentId: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        slug: true,
        parentId: true,
        projectId: true,
        isShared: true,
        version: true,
        updatedAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    return ok(res, pages);
  }),
);

wikiRouter.get(
  '/:id',
  ...base,
  ah(async (req, res) => {
    const page = await prisma.wikiPage.findFirst({
      where: { id: req.params.id, workspaceId: req.ws!.workspaceId, ...visibilityFilter(req.ws!.role) },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        children: { select: { id: true, title: true, slug: true } },
        attachments: true,
        _count: { select: { versions: true } },
      },
    });
    if (!page) throw notFound('Page not found');
    return ok(res, page);
  }),
);

wikiRouter.post(
  '/',
  ...base,
  requirePermission('wiki.write'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        projectId: z.string(),
        title: z.string().min(1).max(150),
        content: z.string().max(200_000).default(''),
        parentId: z.string().nullable().optional(),
        isShared: z.boolean().default(false),
      }),
      req.body,
    );

    const project = await prisma.project.findFirst({ where: { id: body.projectId, workspaceId: req.ws!.workspaceId } });
    if (!project) throw notFound('Project not found');

    let slug = slugify(body.title);
    for (let i = 2; await prisma.wikiPage.findUnique({ where: { projectId_slug: { projectId: project.id, slug } } }); i += 1) {
      slug = `${slugify(body.title)}-${i}`;
    }

    const content = cleanRichText(body.content);
    const page = await prisma.wikiPage.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId: project.id,
        parentId: body.parentId ?? null,
        title: cleanText(body.title),
        slug,
        content,
        isShared: body.isShared,
        authorId: req.user!.id,
        versions: { create: { version: 1, title: cleanText(body.title), content, authorId: req.user!.id } },
      },
    });

    await activity({
      workspaceId: req.ws!.workspaceId,
      projectId: project.id,
      actorId: req.user!.id,
      type: 'wiki.created',
      message: `${req.user!.name} created the doc "${page.title}"`,
    });
    void queueEmbedding({ workspaceId: req.ws!.workspaceId, projectId: project.id, sourceType: 'wiki', sourceId: page.id });
    return created(res, page);
  }),
);

wikiRouter.patch(
  '/:id',
  ...base,
  requirePermission('wiki.write'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        title: z.string().min(1).max(150).optional(),
        content: z.string().max(200_000).optional(),
        parentId: z.string().nullable().optional(),
        isShared: z.boolean().optional(),
      }),
      req.body,
    );

    const page = await prisma.wikiPage.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!page) throw notFound('Page not found');

    const title = body.title ? cleanText(body.title) : page.title;
    const content = body.content !== undefined ? cleanRichText(body.content) : page.content;
    const contentChanged = title !== page.title || content !== page.content;
    const version = contentChanged ? page.version + 1 : page.version;

    const updated = await prisma.wikiPage.update({
      where: { id: page.id },
      data: {
        title,
        content,
        version,
        authorId: req.user!.id,
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
        ...(contentChanged
          ? { versions: { create: { version, title, content, authorId: req.user!.id } } }
          : {}),
      },
    });

    if (contentChanged) {
      void queueEmbedding({ workspaceId: req.ws!.workspaceId, projectId: page.projectId, sourceType: 'wiki', sourceId: page.id });
    }
    return ok(res, updated);
  }),
);

wikiRouter.get(
  '/:id/versions',
  ...base,
  ah(async (req, res) => {
    const page = await prisma.wikiPage.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!page) throw notFound('Page not found');
    const versions = await prisma.wikiVersion.findMany({
      where: { pageId: page.id },
      orderBy: { version: 'desc' },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return ok(res, versions);
  }),
);

wikiRouter.post(
  '/:id/restore/:version',
  ...base,
  requirePermission('wiki.write'),
  ah(async (req, res) => {
    const page = await prisma.wikiPage.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!page) throw notFound('Page not found');
    const target = await prisma.wikiVersion.findUnique({
      where: { pageId_version: { pageId: page.id, version: Number(req.params.version) } },
    });
    if (!target) throw notFound('Version not found');

    const version = page.version + 1;
    const updated = await prisma.wikiPage.update({
      where: { id: page.id },
      data: {
        title: target.title,
        content: target.content,
        version,
        authorId: req.user!.id,
        versions: { create: { version, title: target.title, content: target.content, authorId: req.user!.id } },
      },
    });
    return ok(res, updated);
  }),
);

wikiRouter.delete(
  '/:id',
  ...base,
  requirePermission('wiki.write'),
  ah(async (req, res) => {
    const page = await prisma.wikiPage.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!page) throw notFound('Page not found');
    if (page.authorId !== req.user!.id && req.ws!.role === 'MEMBER') throw forbidden('Only the author or a manager can delete this page');
    await prisma.wikiPage.delete({ where: { id: page.id } });
    return ok(res, { message: 'Page deleted' });
  }),
);
