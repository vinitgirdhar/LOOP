import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Deploy check. Confirms the Supabase env vars resolved and that the project is
 * reachable, without requiring a signed-in user. "no session" is a pass.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getUser();
    const noSession = error?.message === 'Auth session missing!';

    return Response.json({
      ok: !error || noSession,
      supabase: 'reachable',
      session: error ? 'none' : 'active',
      detail: error && !noSession ? error.message : undefined,
    });
  } catch (error) {
    return Response.json({ ok: false, detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}
