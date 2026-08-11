import { ZodError, type ZodTypeAny, type output } from 'zod';
import { camelise } from '../case';

/**
 * The response envelope every route handler returns.
 *
 * It is deliberately identical to what the Express API sent, because
 * `lib/api.ts` and all 35 call sites already unwrap this exact shape.
 */
export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string, details?: { path: string; message: string }[]) =>
  new HttpError(400, m, 'bad_request', details);
export const unauthorized = (m = 'Not authenticated') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');
export const conflict = (m: string) => new HttpError(409, m, 'conflict');

/** Success. Rows are camelised on the way out so components need no mapping. */
export function ok<T>(data: T, meta?: ApiMeta, status = 200) {
  return Response.json({ success: true, data: camelise<T>(data), ...(meta ? { meta } : {}) }, { status });
}

export const created = <T>(data: T) => ok(data, undefined, 201);

/**
 * Turns a thrown error into the envelope the client expects.
 *
 * Only HttpError messages are surfaced. Anything else is logged server-side and
 * reported generically, so a Postgres error never leaks a column name or a
 * constraint definition to the browser.
 */
export function fail(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json(
      { success: false, error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) },
      { status: error.status },
    );
  }

  // A spent AI quota is not an internal fault, and "Something went wrong" is
  // not something the reader can act on. Matched by name so this layer does
  // not have to import the server-only AI module.
  if (error instanceof Error && error.name === 'AiError') {
    const reason = (error as Error & { reason?: string }).reason ?? 'unavailable';
    return Response.json({ success: false, error: error.message, code: `ai_${reason}` }, { status: reason === 'rate_limited' ? 429 : 503 });
  }

  console.error('[api] unhandled', error);
  return Response.json({ success: false, error: 'Something went wrong', code: 'internal' }, { status: 500 });
}

/** Wraps a handler so every throw becomes a proper envelope instead of a 500 HTML page. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

/** Validates at the trust boundary; returns the parsed output with defaults applied. */
export function parse<S extends ZodTypeAny>(schema: S, payload: unknown): output<S> {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw badRequest(details[0]?.message ?? 'Invalid request body', details);
    }
    throw error;
  }
}

/** Reads and validates a JSON body. A missing or malformed body is a 400, not a crash. */
export async function body<S extends ZodTypeAny>(request: Request, schema: S): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest('Expected a JSON body');
  }
  return parse(schema, raw);
}

export function pagination(url: URL, defaultLimit = 25) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || defaultLimit));
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 };
}

/**
 * PostgREST errors, mapped to the status the client expects.
 * `PGRST116` is "no rows where one was required"; `42501` is an RLS refusal.
 */
export function assertOk(error: { code?: string; message: string } | null, whatFor: string): void {
  if (!error) return;
  if (error.code === 'PGRST116') throw notFound(`${whatFor} not found`);
  if (error.code === '42501') throw forbidden();
  if (error.code === '23505') throw conflict(`That ${whatFor.toLowerCase()} already exists`);
  if (error.code === '23503') throw badRequest(`Referenced ${whatFor.toLowerCase()} does not exist`);

  console.error(`[api] ${whatFor}:`, error);
  throw new HttpError(400, error.message || 'Request failed', 'query_failed');
}
