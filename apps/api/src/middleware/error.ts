import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@loop/db';
import { HttpError } from '../lib/http.js';
import { isProd } from '../env.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, error: `No route for ${req.method} ${req.originalUrl}`, code: 'not_found' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, error: err.message, code: err.code, details: err.details });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
      res.status(409).json({ success: false, error: `That ${target} is already taken`, code: 'conflict' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: 'Record not found', code: 'not_found' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({ success: false, error: 'Related record does not exist', code: 'bad_request' });
      return;
    }
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  logger.error('unhandled error', err instanceof Error ? err.stack : err);
  res.status(500).json({
    success: false,
    error: isProd ? 'Something went wrong on our side' : message,
    code: 'internal_error',
  });
};
