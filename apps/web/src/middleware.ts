import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase session on every request.
 *
 * Access tokens are short lived. Without this the cookie quietly expires and
 * server components start rendering as signed-out while the browser still
 * thinks it has a session. `getUser()` is what triggers the refresh — it
 * revalidates against the auth server, unlike `getSession()` which trusts the
 * cookie as-is and so must not be used for an authorisation decision.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Page requests only.
     *
     * `/api/*` is excluded on purpose: every route handler already opens with
     * requireUser(), which calls getUser() itself. Running the middleware over
     * them too meant two auth round trips to Supabase before a single row was
     * read, on every request the app makes — the largest single cost in a page
     * load. Route handlers can also write refreshed cookies themselves, so
     * nothing is lost by skipping them.
     *
     * Static assets are excluded because they carry no session to refresh.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|woff2?)$).*)',
  ],
};
