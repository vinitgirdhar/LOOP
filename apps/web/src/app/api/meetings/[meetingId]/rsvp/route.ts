import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ meetingId: string }> };

const schema = z.object({ status: z.enum(['INVITED', 'ACCEPTED', 'DECLINED']) });

/** You may only answer for yourself. */
export const POST = route(async (request: Request, { params }: Params) => {
  const { meetingId } = await params;
  const ctx = await requireMember(request);
  const { status } = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('meeting_participants')
    .upsert({ meeting_id: meetingId, user_id: ctx.user.id, status }, { onConflict: 'meeting_id,user_id' })
    .select('*')
    .single();

  assertOk(error, 'RSVP');
  return ok(data);
});
