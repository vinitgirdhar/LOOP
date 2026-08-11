import assert from 'node:assert/strict';
import { hashToken, linkRejection, mintToken, tokenMatches, type ShareLinkRow } from './share';

/*
  Guest links are the only unauthenticated read path in the product, so the
  token rules get checked rather than assumed.
*/

const row = (over: Partial<ShareLinkRow> = {}): ShareLinkRow => ({
  id: 'l1',
  project_id: 'p1',
  workspace_id: 'w1',
  token_hash: 'a'.repeat(64),
  scopes: ['progress'],
  expires_at: null,
  revoked_at: null,
  ...over,
});

// ── token shape ───────────────────────────────────────────────────────────
{
  const { token, hash, hint } = mintToken();
  assert.ok(token.length >= 40, '32 random bytes base64url encode to at least 40 chars');
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'base64url is URL-safe with no padding to escape');
  assert.equal(hash.length, 64, 'sha256 hex is 64 chars');
  assert.notEqual(hash, token, 'the stored value is never the token itself');
  assert.ok(token.startsWith(hint), 'the hint is a prefix, so the UI can label a link');
  assert.equal(hint.length, 8, 'and is far too short to brute force back to the token');

  const again = mintToken();
  assert.notEqual(again.token, token, 'tokens do not repeat');
}

// ── hashing is stable and one-way ─────────────────────────────────────────
{
  assert.equal(hashToken('abc'), hashToken('abc'), 'the same token always hashes the same way');
  assert.notEqual(hashToken('abc'), hashToken('abd'), 'a one-character change changes the digest');
}

// ── comparison ────────────────────────────────────────────────────────────
{
  const h = hashToken('secret');
  assert.equal(tokenMatches(h, h), true);
  assert.equal(tokenMatches(h, hashToken('other')), false);
  assert.equal(tokenMatches('', h), false, 'an empty candidate never matches');
  assert.equal(tokenMatches('abcd', h), false, 'a length mismatch is rejected before comparing');
}

// ── validity gate ─────────────────────────────────────────────────────────
{
  assert.equal(linkRejection(row()), null, 'a live link with no expiry is usable');
  assert.equal(linkRejection(null), 'This link is not valid', 'an unknown token is refused');

  assert.ok(linkRejection(row({ revoked_at: new Date().toISOString() })), 'a revoked link is refused');

  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  assert.ok(linkRejection(row({ expires_at: yesterday })), 'an expired link is refused');

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(linkRejection(row({ expires_at: tomorrow })), null, 'a link expiring tomorrow still works today');

  // Revocation must win even if the expiry has not passed.
  assert.ok(
    linkRejection(row({ expires_at: tomorrow, revoked_at: new Date().toISOString() })),
    'revocation beats a future expiry',
  );
}

console.log('share: all checks passed');
