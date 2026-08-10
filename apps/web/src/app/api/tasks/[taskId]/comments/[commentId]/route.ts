import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, forbidden, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string; commentId: string }> };

const schema = z.object({ body: z.string().trim().min(1).max(5000) });

/** Only the author edits their own words. */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const { commentId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, schema);

  const { data: existing } = await ctx.supabase.from('comments').select('author_id').eq('id', commentId).maybeSingle();
  if (existing && existing.author_id !== ctx.user.id) throw forbidden('You can only edit your own comments');

  const { data, error } = await ctx.supabase
    .from('comments')
    .update({ body: input.body, edited_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('author_id', ctx.user.id)
    .select('*, author:profiles (id, name, avatar_url, mascot)')
    .single();

  assertOk(error, 'Comment');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { commentId } = await params;
  const ctx = await requireMember(request);

  const { error } = await ctx.supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('workspace_id', ctx.ws.workspaceId);

  assertOk(error, 'Comment');
  return ok({ deleted: true });
});
