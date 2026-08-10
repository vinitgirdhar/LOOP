import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Server client for route handlers and server components.
 *
 * It uses the anon key plus the caller's session cookie, so every query it runs
 * is still subject to row level security — the signed-in user's own permissions,
 * not a bypass. Nothing here should ever be swapped for the service_role key.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components cannot set cookies. Harmless: middleware already
          // refreshed the session for this request.
        }
      },
    },
  });
}
