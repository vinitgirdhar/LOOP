import { requireMember } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/**
 * Who is already busy in a window, so the meeting form can warn before it
 * double-books someone.
 */
export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return ok([]);

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at, ends_at, participants:meeting_participants (user_id, status)')
    .eq('workspace_id', ws.workspaceId)
    .lt('starts_at', to)
    .gt('ends_at', from);

  const busy = new Map<string, { meetingId: string; title: string; startsAt: string; endsAt: string }[]>();
  for (const meeting of meetings ?? []) {
    const participants = (meeting.participants ?? []) as { user_id: string; status: string }[];
    for (const participant of participants) {
      if (participant.status === 'DECLINED') continue;
      const list = busy.get(participant.user_id) ?? [];
      list.push({ meetingId: meeting.id, title: meeting.title, startsAt: meeting.starts_at, endsAt: meeting.ends_at });
      busy.set(participant.user_id, list);
    }
  }

  return ok([...busy.entries()].map(([userId, conflicts]) => ({ userId, conflicts })));
});
