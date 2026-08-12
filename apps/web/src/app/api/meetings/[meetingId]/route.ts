import { z } from 'zod';
import { detectProvider } from '@/lib/meeting-links';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ meetingId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { meetingId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('meetings')
    .select('*, createdBy:profiles (id, name, avatar_url), participants:meeting_participants (status, user:profiles (id, name, avatar_url))')
    .eq('id', meetingId)
    .eq('workspace_id', ws.workspaceId)
    .single();

  assertOk(error, 'Meeting');
  return ok(data);
});

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  agenda: z.string().trim().max(5000).nullable().optional(),
  notes: z.string().trim().max(20000).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  meetingUrl: z.string().trim().url().max(500).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { meetingId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'meeting.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('meetings')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.agenda !== undefined ? { agenda: input.agenda } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.meetingUrl !== undefined ? { meeting_url: input.meetingUrl, conference_provider: detectProvider(input.meetingUrl) } : {}),
      ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}),
    })
    .eq('id', meetingId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Meeting');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { meetingId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'meeting.manage');

  const { error } = await ctx.supabase.from('meetings').delete().eq('id', meetingId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Meeting');
  return ok({ deleted: true });
});
