import { requireMember } from '@/lib/server/context';
import { fail, notFound } from '@/lib/server/http';

type Params = { params: Promise<{ meetingId: string }> };

/** RFC 5545 wants CRLF line endings and escaped separators. */
const escape = (value: string) => value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
const stamp = (value: string) => `${new Date(value).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

export async function GET(request: Request, { params }: Params) {
  try {
    const { meetingId } = await params;
    const { supabase, ws } = await requireMember(request);

    const { data: meeting } = await supabase
      .from('meetings')
      .select('id, title, agenda, location, starts_at, ends_at')
      .eq('id', meetingId)
      .eq('workspace_id', ws.workspaceId)
      .maybeSingle();

    if (!meeting) throw notFound('Meeting not found');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Loop//Meetings//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${meeting.id}@loop`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(meeting.starts_at)}`,
      `DTEND:${stamp(meeting.ends_at)}`,
      `SUMMARY:${escape(meeting.title)}`,
      ...(meeting.agenda ? [`DESCRIPTION:${escape(meeting.agenda)}`] : []),
      ...(meeting.location ? [`LOCATION:${escape(meeting.location)}`] : []),
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    return new Response(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${meeting.id}.ics"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
