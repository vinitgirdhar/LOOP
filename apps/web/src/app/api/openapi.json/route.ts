import spec from '@/lib/openapi.json';

/**
 * The OpenAPI 3.1 description of this API.
 *
 * Served unauthenticated on purpose — a specification lists what exists and
 * what shape it has, never any data, and a docs page nobody can open without
 * an account is not documentation. Regenerate with `npm run openapi`.
 */
export function GET() {
  return Response.json(spec, {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
