import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, notFound, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ pageId: string; versionId: string }> };

/** Restoring is itself an edit, so the current text is snapshotted first. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { pageId, versionId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'wiki.write');

  const [{ data: version }, { data: current }] = await Promise.all([
    ctx.supabase.from('wiki_versions').select('title, content').eq('id', versionId).eq('page_id', pageId).maybeSingle(),
    ctx.supabase.from('wiki_pages').select('title, content, version').eq('id', pageId).maybeSingle(),
  ]);

  if (!version || !current) throw notFound('That version is not available');

  await ctx.supabase.from('wiki_versions').insert({
    page_id: pageId,
    title: current.title,
    content: current.content,
    version: current.version,
    author_id: ctx.user.id,
  });

  const { data, error } = await ctx.supabase
    .from('wiki_pages')
    .update({ title: version.title, content: version.content, version: current.version + 1, author_id: ctx.user.id })
    .eq('id', pageId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Page');
  return ok(data);
});
