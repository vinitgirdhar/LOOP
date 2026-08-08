import type { CookieOptions, Request, Response } from 'express';
import { env, isProd } from '../env.js';
import { forbidden } from './http.js';

export const REFRESH_COOKIE = 'loop_rt';
export const OAUTH_STATE_COOKIE = 'loop_oauth_state';

function base(): CookieOptions {
  const crossSite = env.CROSS_SITE_COOKIES;
  return {
    secure: crossSite || isProd,
    sameSite: crossSite ? 'none' : 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    path: '/',
  };
}

export function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base(),
    httpOnly: true,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...base(), httpOnly: true });
}

export function setOAuthStateCookie(res: Response, state: string) {
  res.cookie(OAUTH_STATE_COOKIE, state, { ...base(), httpOnly: true, maxAge: 10 * 60 * 1000 });
}

export function clearOAuthStateCookie(res: Response) {
  res.clearCookie(OAUTH_STATE_COOKIE, { ...base(), httpOnly: true });
}

/**
 * CSRF defence for the two cookie-authenticated endpoints (refresh, logout).
 *
 * A custom header cannot be set by a cross-site form or img tag, and any
 * fetch that tries triggers a CORS preflight which our origin allowlist
 * rejects. That is the whole protection — no token to synchronise.
 */
export const CLIENT_HEADER = 'x-loop-client';

export function assertSameSiteRequest(req: Request) {
  if (!req.get(CLIENT_HEADER)) throw forbidden('Missing client header');
}
