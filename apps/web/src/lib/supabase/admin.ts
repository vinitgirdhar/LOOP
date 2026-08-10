import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * `server-only` makes importing this from a client component a build error,
 * which is the guardrail that matters — the key must never reach a browser
 * bundle. Use it exclusively for work that has no user to act on behalf of:
 * webhooks, scheduled jobs, invite acceptance before the invitee has a session.
 *
 * Every use must do its own authorisation check first, because Postgres will
 * not do it for you here.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (server-side only).');

  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
