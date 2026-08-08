import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';

/** Authenticated callers are limited per user, anonymous ones per IP. */
const keyGenerator = (req: Request) => req.user?.id ?? req.ip ?? 'anonymous';

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: { success: false, error: 'Too many requests, slow down', code: 'rate_limited' },
};

export const globalLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 300 });

/** Login / signup / reset — brute force protection. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
});

/** AI endpoints cost money and tokens. */
export const aiLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 15 });

export const uploadLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 30 });

export const writeLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 120 });
