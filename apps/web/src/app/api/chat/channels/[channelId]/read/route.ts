import { requireUser } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ channelId: string }> };

/** Marks the channel read up to now, for this person only. */
export const POST = route(async (_request: Request, { params }: Params) => {
  const { channelId } = await params;
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from('channel_members')
    .upsert(
      { channel_id: channelId, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,user_id' },
    );

  assertOk(error, 'Channel');
  return ok({ read: true });
});
