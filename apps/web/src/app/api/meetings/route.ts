import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

const MEETING_SELECT =
  '*, createdBy:profiles (id, name, avatar_url, mascot), project:projects (id, name, key), participants:meeting_participants (user_id, status)';

export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  let query = supabase
    .from('meetings')
    .select(MEETING_SELECT)
    .eq('workspace_id', ws.workspaceId)
    .order('starts_at', { ascending: true });

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from) query = query.gte('starts_at', from);
  if (to) query = query.lte('starts_at', to);

  const { data, error } = await query;
  assertOk(error, 'Meetings');
  return ok(data ?? []);
});

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  agenda: z.string().trim().max(5000).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  participantIds: z.array(z.string().uuid()).max(50).default([]),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'meeting.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('meetings')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      title: input.title,
      agenda: input.agenda ?? null,
      location: input.location ?? null,
      project_id: input.projectId ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      created_by_id: ctx.user.id,
    })
    .select(MEETING_SELECT)
    .single();

  assertOk(error, 'Meeting');

  const invitees = new Set([...input.participantIds, ctx.user.id]);
  await ctx.supabase.from('meeting_participants').insert(
    [...invitees].map((userId) => ({
      meeting_id: data!.id,
      user_id: userId,
      status: userId === ctx.user.id ? 'ACCEPTED' : 'INVITED',
    })),
  );

  return created(data);
});
