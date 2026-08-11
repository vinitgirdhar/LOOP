import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);

  const [{ data: channels, error }, { data: reads }] = await Promise.all([
    supabase
      .from('channels')
      .select('*, project:projects (id, name, key), members:channel_members (user_id, user:profiles (id, name, avatar_url))')
      .eq('workspace_id', ws.workspaceId)
      .order('name', { ascending: true }),
    supabase.from('channel_members').select('channel_id, last_read_at').eq('user_id', user.id),
  ]);

  assertOk(error, 'Channels');

  const rows = channels ?? [];
  const ids = rows.map((channel: { id: string }) => channel.id);
  const readAt = new Map(((reads ?? []) as { channel_id: string; last_read_at: string | null }[]).map((row) => [row.channel_id, row.last_read_at]));

  // One pass over message timestamps gives both the total and the unread count
  // per channel; a per-channel count query would be one round trip each.
  const { data: stamps } = ids.length
    ? await supabase
        .from('messages')
        .select('channel_id, created_at, author_id')
        .in('channel_id', ids)
        .is('deleted_at', null)
    : { data: [] as { channel_id: string; created_at: string; author_id: string }[] };

  const totals = new Map<string, number>();
  const unread = new Map<string, number>();
  for (const row of (stamps ?? []) as { channel_id: string; created_at: string; author_id: string }[]) {
    totals.set(row.channel_id, (totals.get(row.channel_id) ?? 0) + 1);
    const since = readAt.get(row.channel_id);
    // Your own messages are never unread, and a channel never read counts all.
    if (row.author_id !== user.id && (!since || row.created_at > since)) {
      unread.set(row.channel_id, (unread.get(row.channel_id) ?? 0) + 1);
    }
  }

  return ok(
    rows.map((channel: Record<string, unknown>) => {
      const id = channel.id as string;
      const members = ((channel.members ?? []) as { user_id: string; user: unknown }[]).filter((member) => member.user);
      return {
        ...channel,
        members,
        lastReadAt: readAt.get(id) ?? null,
        joined: readAt.has(id),
        unread: unread.get(id) ?? 0,
        _count: { messages: totals.get(id) ?? 0 },
      };
    }),
  );
});

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  topic: z.string().trim().max(200).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  isPrivate: z.boolean().default(false),
  type: z.enum(['CHANNEL', 'DM']).default('CHANNEL'),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'chat.write');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('channels')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      name: input.name,
      topic: input.topic ?? null,
      project_id: input.projectId ?? null,
      is_private: input.isPrivate,
      type: input.type,
    })
    .select('*')
    .single();

  assertOk(error, 'Channel');

  // The creator joins immediately, otherwise a private channel would have no
  // members and nobody able to add any.
  await ctx.supabase.from('channel_members').insert({ channel_id: data!.id, user_id: ctx.user.id });

  return created(data);
});
