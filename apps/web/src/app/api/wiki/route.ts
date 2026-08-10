import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  let query = supabase
    .from('wiki_pages')
    .select('id, title, slug, project_id, parent_id, is_shared, version, updated_at, author:profiles (id, name, avatar_url)')
    .eq('workspace_id', ws.workspaceId)
    .order('updated_at', { ascending: false });

  const projectId = url.searchParams.get('projectId');
  const search = url.searchParams.get('q');
  if (projectId) query = query.eq('project_id', projectId);
  if (search) query = query.ilike('title', `%${search.replace(/[,()]/g, ' ')}%`);

  const { data, error } = await query;
  assertOk(error, 'Wiki');
  return ok(data ?? []);
});

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().max(200000).default(''),
  // wiki_pages.project_id is NOT NULL — pages hang off a project.
  projectId: z.string().uuid('Pick a project'),
  parentId: z.string().uuid().nullable().optional(),
  isShared: z.boolean().default(false),
});

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page';

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'wiki.write');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('wiki_pages')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      title: input.title,
      slug: `${slugify(input.title)}-${Date.now().toString(36)}`,
      content: input.content,
      project_id: input.projectId,
      parent_id: input.parentId ?? null,
      is_shared: input.isShared,
      author_id: ctx.user.id,
      version: 1,
    })
    .select('*')
    .single();

  assertOk(error, 'Page');
  return created(data);
});
