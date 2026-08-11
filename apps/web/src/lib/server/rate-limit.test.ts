import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LIMITS, RateLimitError, callerIp, enforceRateLimit } from './rate-limit';

/*
  The limiter is the thing standing between a stolen session and the AI bill,
  so its failure modes are checked rather than assumed — particularly that it
  fails open, which is a deliberate choice and not an accident to be "fixed"
  later by someone reading it cold.
*/

const client = (result: { data?: unknown; error?: { message: string } | null }) =>
  ({ rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }) }) as unknown as SupabaseClient;

// ── policies ──────────────────────────────────────────────────────────────
{
  for (const [name, policy] of Object.entries(LIMITS)) {
    assert.ok(policy.limit > 0, `${name} allows at least one request`);
    assert.ok(policy.windowSeconds > 0, `${name} has a real window`);
  }
  assert.ok(LIMITS.auth.limit < LIMITS.write.limit, 'sign-in attempts are tighter than ordinary writes');
  assert.ok(LIMITS.ai.limit < LIMITS.write.limit, 'model calls are tighter than ordinary writes');
}

async function main() {
  // ── allowed ───────────────────────────────────────────────────────────────
  {
    const verdict = await enforceRateLimit(
      client({ data: [{ allowed: true, remaining: 4, reset_at: new Date(Date.now() + 60_000).toISOString() }] }),
      'ai',
      'user-1',
    );
    assert.equal(verdict?.remaining, 4);
  }

  // ── refused ───────────────────────────────────────────────────────────────
  {
    const resetAt = new Date(Date.now() + 30_000).toISOString();
    await assert.rejects(
      () => enforceRateLimit(client({ data: [{ allowed: false, remaining: 0, reset_at: resetAt }] }), 'ai', 'user-1'),
      (error: unknown) => {
        assert.ok(error instanceof RateLimitError);
        assert.equal(error.status, 429);
        assert.equal(error.code, 'rate_limited');
        assert.ok(error.retryAfterSeconds > 0 && error.retryAfterSeconds <= 30, 'Retry-After is derived from the real window end');
        return true;
      },
    );
  }

  // ── a window that has already closed still yields a usable Retry-After ────
  {
    await assert.rejects(
      () =>
        enforceRateLimit(
          client({ data: [{ allowed: false, remaining: 0, reset_at: new Date(Date.now() - 5_000).toISOString() }] }),
          'auth',
          'user-1',
        ),
      (error: unknown) => {
        assert.ok(error instanceof RateLimitError);
        assert.equal(error.retryAfterSeconds, 1, 'never advertises a retry in the past');
        return true;
      },
    );
  }

  // ── fails open ────────────────────────────────────────────────────────────
  {
    // A limiter that 500s the whole API when its counter table is unreachable
    // has turned a soft problem into an outage.
    const verdict = await enforceRateLimit(client({ error: { message: 'connection refused' } }), 'ai', 'user-1');
    assert.equal(verdict, null, 'a counter failure allows the request through');

    const empty = await enforceRateLimit(client({ data: [] }), 'ai', 'user-1');
    assert.equal(empty, null, 'so does an empty result set');
  }

  // ── caller identity ───────────────────────────────────────────────────────
  {
    const withHeader = (headers: Record<string, string>) => new Request('https://example.com', { headers });

    assert.equal(callerIp(withHeader({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7');
    assert.equal(
      callerIp(withHeader({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' })),
      '203.0.113.7',
      'the leftmost entry is the real client behind the proxy',
    );
    assert.equal(callerIp(withHeader({ 'x-real-ip': '198.51.100.4' })), '198.51.100.4');
    assert.equal(
      callerIp(withHeader({})),
      'unknown',
      'an unidentifiable caller shares one bucket rather than getting an unlimited private one',
    );
    assert.equal(callerIp(withHeader({ 'x-forwarded-for': '  ' })), 'unknown', 'a blank header is not an identity');
  }

  console.log('rate-limit: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
