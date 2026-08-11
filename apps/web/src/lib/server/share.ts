import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Guest link tokens.
 *
 * 32 bytes of CSPRNG output, base64url encoded. That is the entire security of
 * a public page — there is no second factor behind it — so it must be wide
 * enough that guessing is hopeless and it must never be stored in a form that
 * a database leak turns back into a working URL.
 */
export const SHARE_SCOPES = ['progress', 'tasks', 'docs', 'milestones'] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];

export function mintToken(): { token: string; hash: string; hint: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token), hint: token.slice(0, 8) };
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Constant-time comparison of two hex digests.
 *
 * The lookup itself is by unique index on `token_hash`, so this is belt and
 * braces rather than the primary defence — but a plain `===` on a secret is the
 * kind of thing that is correct until someone moves the lookup into a loop.
 */
export function tokenMatches(candidateHash: string, storedHash: string): boolean {
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export interface ShareLinkRow {
  id: string;
  project_id: string;
  workspace_id: string;
  token_hash: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
}

/** Why a link is not usable, or null if it is. */
export function linkRejection(link: ShareLinkRow | null): string | null {
  if (!link) return 'This link is not valid';
  if (link.revoked_at) return 'This link has been revoked';
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return 'This link has expired';
  return null;
}
