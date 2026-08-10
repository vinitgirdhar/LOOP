import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);

  const [{ data: channels, error }, { data: reads }] = await Promise.all([
    supabase
      .from('channels')
      .select('*, project:projects (id, name, key)')
      .eq('workspace_id', ws.workspaceId)
      .order('name', { ascending: true }),
    supabase.from('channel_members').select('channel_id, last_read_at').eq('user_id', user.id),
  ]);

  assertOk(error, 'Channels');

  const readAt = new Map((reads ?? []).map((row) => [row.channel_id, row.last_read_at]));
  return ok((channels ?? []).map((channel) => ({ ...channel, lastReadAt: readAt.get(channel.id) ?? null })));
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
