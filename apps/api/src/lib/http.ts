import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type output } from 'zod';

/** Consistent API envelope used by every route. */
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
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, 'bad_request', details);
export const unauthorized = (m = 'Not authenticated') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');
export const conflict = (m: string) => new HttpError(409, m, 'conflict');
export const tooMany = (m = 'Too many requests') => new HttpError(429, m, 'rate_limited');

export function ok<T>(res: Response, data: T, meta?: ApiMeta) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ success: true, data });
}

/** Wraps an async handler so rejections reach the error middleware (Express 4). */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Validates at the trust boundary and returns the parsed *output* type (defaults applied). */
export function parse<S extends ZodTypeAny>(schema: S, payload: unknown): output<S> {
  try {
    return schema.parse(payload);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw badRequest(details[0]?.message ?? 'Invalid request body', details);
    }
    throw error;
  }
}

export function pagination(query: Record<string, unknown>, defaultLimit = 25) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}
