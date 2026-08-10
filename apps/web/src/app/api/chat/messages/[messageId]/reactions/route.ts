import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ messageId: string }> };

const schema = z.object({ emoji: z.string().trim().min(1).max(16) });

/** Reacting twice with the same emoji removes it, which is what the UI expects. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { messageId } = await params;
  const ctx = await requireMember(request);
  const { emoji } = await body(request, schema);

  const { data: existing } = await ctx.supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', ctx.user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await ctx.supabase.from('message_reactions').delete().eq('id', existing.id);
    assertOk(error, 'Reaction');
  } else {
    const { error } = await ctx.supabase
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: ctx.user.id, emoji });
    assertOk(error, 'Reaction');
  }

  const { data: reactions } = await ctx.supabase
    .from('message_reactions')
    .select('id, emoji, user_id')
    .eq('message_id', messageId);

  return ok({ messageId, reactions: reactions ?? [] });
});
