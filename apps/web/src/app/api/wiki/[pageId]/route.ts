import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, notFound, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ pageId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { pageId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('wiki_pages')
    .select('*, author:profiles (id, name, avatar_url, mascot), project:projects (id, name, key)')
    .eq('id', pageId)
    .eq('workspace_id', ws.workspaceId)
    .single();

  assertOk(error, 'Page');
  return ok(data);
});

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().max(200000).optional(),
  isShared: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

/**
 * Every edit snapshots what was there before.
 *
 * The version row is written first: if the update then fails, history has a
 * harmless duplicate, whereas the other order could lose the previous text
 * entirely.
 */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const { pageId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'wiki.write');
  const input = await body(request, schema);

  const { data: current } = await ctx.supabase
    .from('wiki_pages')
    .select('title, content, version')
    .eq('id', pageId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .maybeSingle();

  if (!current) throw notFound('Page not found');

  const changingText = input.title !== undefined || input.content !== undefined;
  if (changingText) {
    await ctx.supabase.from('wiki_versions').insert({
      page_id: pageId,
      title: current.title,
      content: current.content,
      version: current.version,
      author_id: ctx.user.id,
    });
  }

  const { data, error } = await ctx.supabase
    .from('wiki_pages')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.isShared !== undefined ? { is_shared: input.isShared } : {}),
      ...(input.parentId !== undefined ? { parent_id: input.parentId } : {}),
      ...(changingText ? { version: current.version + 1, author_id: ctx.user.id } : {}),
    })
    .eq('id', pageId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Page');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { pageId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'wiki.write');

  const { error } = await ctx.supabase.from('wiki_pages').delete().eq('id', pageId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Page');
  return ok({ deleted: true });
});
