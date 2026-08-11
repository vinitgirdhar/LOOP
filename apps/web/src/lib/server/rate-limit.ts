import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http';

/**
 * Request quotas.
 *
 * Named policies rather than magic numbers at each call site, so the limits are
 * reviewable in one place and a route cannot quietly grant itself ten times
 * what its neighbour allows.
 */
export const LIMITS = {
  /** Model calls cost real money. This is the ceiling on a single account's spend. */
  ai: { limit: 20, windowSeconds: 60 * 5 },
  /** Credential stuffing and 2FA brute force. Deliberately tight. */
  auth: { limit: 8, windowSeconds: 60 * 10 },
  /** Guest links are unauthenticated, so the bucket is the caller's IP. */
  publicLink: { limit: 60, windowSeconds: 60 },
  /** Ordinary writes. High enough that no real person notices it. */
  write: { limit: 120, windowSeconds: 60 },
  /** Anything that fans out — search, exports, bulk operations. */
  expensive: { limit: 30, windowSeconds: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export class RateLimitError extends HttpError {
  constructor(public retryAfterSeconds: number) {
    super(429, `Too many requests. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`, 'rate_limited');
    this.name = 'RateLimitError';
  }
}

interface Verdict {
  allowed: boolean;
  remaining: number;
  reset_at: string;
}

/**
 * Counts a request and throws 429 once the bucket is spent.
 *
 * Fails **open** on a database error. A rate limiter that takes the whole API
 * down when its own counter table is unreachable has converted a soft problem
 * into an outage; the request is logged and allowed instead.
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  name: LimitName,
  identity: string,
): Promise<{ remaining: number; resetAt: string } | null> {
  const policy = LIMITS[name];
  const bucket = `${name}:${identity}`;

  const { data, error } = await supabase.rpc('app_rate_limit', {
    p_bucket: bucket,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });

  if (error) {
    console.error('[rate-limit] counter unavailable, allowing request', { bucket, error: error.message });
    return null;
  }

  const verdict = (Array.isArray(data) ? data[0] : data) as Verdict | undefined;
  if (!verdict) return null;

  if (!verdict.allowed) {
    const retryAfter = Math.max(1, Math.ceil((new Date(verdict.reset_at).getTime() - Date.now()) / 1000));
    throw new RateLimitError(retryAfter);
  }

  return { remaining: verdict.remaining, resetAt: verdict.reset_at };
}

/**
 * The caller's address, for limiting requests that have no user attached.
 *
 * `x-forwarded-for` is a client-controllable header everywhere except behind a
 * proxy that overwrites it — which Vercel does, taking the leftmost entry as
 * the real client. Falling back to a constant is deliberate: an unknown caller
 * shares one bucket rather than getting an unlimited private one.
 */
export function callerIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}
