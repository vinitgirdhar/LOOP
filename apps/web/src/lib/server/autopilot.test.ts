import assert from 'node:assert/strict';
import { GITHUB_EVENTS, extractTaskKeys } from './autopilot';

/*
  Key extraction is the whole trigger for Auto-Pilot: get it wrong and either
  nothing ever fires, or every branch name creates a card for a task it never
  mentioned. Both were possible before this existed.
*/

const keys = (reference: string) => extractTaskKeys(reference).map((k) => `${k.projectKey}-${k.number}`);

// ── the shapes real branches and titles take ──────────────────────────────
{
  assert.deepEqual(keys('feat/PAY-4-refund-flow'), ['PAY-4'], 'a conventional branch name');
  assert.deepEqual(keys('PAY-4'), ['PAY-4'], 'a bare key');
  assert.deepEqual(keys('fix(PAY-12): retry the webhook'), ['PAY-12'], 'a conventional commit subject');
  assert.deepEqual(keys('pay-7 lowercase'), ['PAY-7'], 'keys are upper-cased so they match the project');
  assert.deepEqual(keys('PAY_9-underscore'), ['PAY-9'], 'underscores separate too');
  assert.deepEqual(keys('Merge PAY 15 into main'), ['PAY-15'], 'so does a plain space');
}

// ── several tasks in one event ────────────────────────────────────────────
{
  assert.deepEqual(keys('PAY-1 and WEB-2'), ['PAY-1', 'WEB-2'], 'every referenced task gets a suggestion');
  assert.deepEqual(keys('PAY-3 again PAY-3'), ['PAY-3'], 'the same key twice is one task, not two cards');
}

// ── things that must not match ────────────────────────────────────────────
{
  assert.deepEqual(keys('no key here'), [], 'prose alone triggers nothing');
  assert.deepEqual(keys(''), [], 'an empty reference is not an error');
  assert.deepEqual(keys('PAY-0'), [], 'task numbers start at 1, so a zero is not a key');
  assert.deepEqual(keys('release/v2'), [], 'a version tag is not a task key');
  assert.deepEqual(keys('v1.2.3'), [], 'nor is a semver string');

  // Known and accepted false positive: any word-then-number pair parses. It is
  // harmless because the engine then looks the project key up and skips what it
  // cannot find, so the cost is one wasted query rather than a bogus card.
  assert.deepEqual(keys('chore/bump-node-20'), ['NODE-20'], 'over-matching is filtered later by project lookup, not here');
}

// ── the rule table covers exactly what the UI offers ──────────────────────
{
  assert.deepEqual(
    [...GITHUB_EVENTS].sort(),
    ['branch_created', 'pull_request_merged', 'pull_request_opened', 'push'],
    'every event the simulate form lists has a rule behind it',
  );
}

console.log('autopilot: all checks passed');
