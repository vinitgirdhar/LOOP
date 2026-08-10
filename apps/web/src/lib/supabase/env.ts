/**
 * Supabase connection details, read once and validated at the boundary.
 *
 * Both values are safe in the browser: the anon key carries no privilege of its
 * own, every request it makes is still filtered by row level security. The
 * service_role key is deliberately absent from this file — it must never be
 * reachable from anything that can end up in a client bundle.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loudly at import time rather than producing a client that 401s on
  // every call — a missing Vercel env var is the likeliest cause and the
  // message needs to say so.
  throw new Error(
    'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      '(locally in .env, in production under Vercel → Settings → Environment Variables).',
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
