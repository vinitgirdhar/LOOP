import { z } from 'zod';
import { detectProvider } from '@/lib/meeting-links';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

// Kept as one literal: supabase-js can only infer a row type from a select it
// can read at compile time, and a concatenated string degrades every caller to
// GenericStringError.
const MEETING_SELECT =
  '*, createdBy:profiles (id, name, avatar_url, mascot), project:projects (id, name, key), participants:meeting_participants (user_id, status, user:profiles (id, name, email, avatar_url)), actionItems:tasks (id, number, title, status, completed_at, assignee:profiles!tasks_assignee_id_fkey (id, name))';

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
  // A membership row whose profile is not readable would hand the avatar stack
  // an undefined person; drop it instead.
  return ok(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((meeting) => ({
      ...meeting,
      participants: ((meeting.participants ?? []) as { user: unknown }[]).filter((participant) => participant.user),
      actionItems: (meeting.actionItems ?? []) as unknown[],
    })),
  );
});

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  agenda: z.string().trim().max(5000).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  // Validated as a URL here as well as by the column constraint, so a bad
  // paste is a field error rather than a 500 from Postgres.
  meetingUrl: z.string().trim().url().max(500).nullable().optional(),
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
      meeting_url: input.meetingUrl ?? null,
      conference_provider: detectProvider(input.meetingUrl) ?? null,
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
