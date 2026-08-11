import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, pagination, route } from '@/lib/server/http';

type Params = { params: Promise<{ channelId: string }> };

const MESSAGE_SELECT =
  '*, author:profiles (id, name, avatar_url, mascot), reactions:message_reactions (id, emoji, user_id)';

export const GET = route(async (request: Request, { params }: Params) => {
  const { channelId } = await params;
  const { supabase, ws } = await requireMember(request);
  const { page, limit, from, to } = pagination(new URL(request.url), 40);

  const { data, error, count } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT, { count: 'exact' })
    .eq('channel_id', channelId)
    .eq('workspace_id', ws.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  assertOk(error, 'Messages');

  const rows = [...(data ?? [])].reverse();
  const ids = rows.map((message) => message.id as string);

  // The transcript shows a reply count on each root message.
  const { data: replies } = ids.length
    ? await supabase.from('messages').select('parent_id').in('parent_id', ids).is('deleted_at', null)
    : { data: [] as { parent_id: string | null }[] };

  const replyCount = new Map<string, number>();
  for (const row of (replies ?? []) as { parent_id: string | null }[]) {
    if (!row.parent_id) continue;
    replyCount.set(row.parent_id, (replyCount.get(row.parent_id) ?? 0) + 1);
  }

  // Oldest first is what the transcript renders, but paging has to start from
  // the newest, so the page is reversed rather than the query.
  return ok(
    rows.map((message) => ({
      ...message,
      attachments: (message as { attachments?: unknown[] }).attachments ?? [],
      _count: { replies: replyCount.get(message.id as string) ?? 0 },
    })),
    { total: count ?? 0, page, limit },
  );
});

const schema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(4000),
  parentId: z.string().uuid().nullable().optional(),
  mentions: z.array(z.string().uuid()).max(20).default([]),
});

export const POST = route(async (request: Request, { params }: Params) => {
  const { channelId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'chat.write');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('messages')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      channel_id: channelId,
      author_id: ctx.user.id,
      body: input.body,
      parent_id: input.parentId ?? null,
      mentions: input.mentions,
    })
    .select(MESSAGE_SELECT)
    .single();

  assertOk(error, 'Message');
  return created(data);
});
