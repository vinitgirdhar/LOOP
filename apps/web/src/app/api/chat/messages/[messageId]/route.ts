import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, forbidden, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ messageId: string }> };

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { messageId } = await params;
  const ctx = await requireMember(request);
  const input = await body(request, schema);

  const { data: existing } = await ctx.supabase.from('messages').select('author_id').eq('id', messageId).maybeSingle();
  if (existing && existing.author_id !== ctx.user.id) throw forbidden('You can only edit your own messages');

  const { data, error } = await ctx.supabase
    .from('messages')
    .update({ body: input.body, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('author_id', ctx.user.id)
    .select('*, author:profiles (id, name, avatar_url, mascot)')
    .single();

  assertOk(error, 'Message');
  return ok(data);
});

/**
 * Soft delete: the row stays so replies keep their parent and the transcript
 * does not silently reshuffle around a gap.
 */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const { messageId } = await params;
  const ctx = await requireMember(request);

  const { error } = await ctx.supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: '' })
    .eq('id', messageId)
    .eq('workspace_id', ctx.ws.workspaceId);

  assertOk(error, 'Message');
  return ok({ deleted: true });
});
