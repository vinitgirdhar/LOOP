import assert from 'node:assert/strict';
import { detectProvider, googleCalendarUrl, isMeetLink } from './meeting-links';

/*
  These build URLs that leave the app, so a malformed one is a dead end the
  reader hits rather than an error anybody sees in a log.
*/

// ── provider detection ────────────────────────────────────────────────────
{
  assert.equal(detectProvider('https://meet.google.com/abc-defg-hij'), 'google_meet');
  assert.equal(detectProvider('https://us02web.zoom.us/j/123456'), 'zoom');
  assert.equal(detectProvider('https://teams.microsoft.com/l/meetup-join/x'), 'teams');
  assert.equal(detectProvider('https://whereby.com/loop'), 'other', 'an unknown host is still a video call');
  assert.equal(detectProvider(null), null, 'a meeting with no link has no provider');
  assert.equal(detectProvider(''), null);
  assert.equal(detectProvider('  HTTPS://MEET.GOOGLE.COM/abc-defg-hij '), 'google_meet', 'case and padding do not matter');
}

// ── Meet code shape ───────────────────────────────────────────────────────
{
  assert.equal(isMeetLink('https://meet.google.com/abc-defg-hij'), true);
  assert.equal(isMeetLink('https://meet.google.com/abc-defg-hij?authuser=0'), true, 'Google appends query params');
  assert.equal(isMeetLink('https://meet.google.com/new'), false, 'the new-room page is not a room');
  assert.equal(isMeetLink('https://zoom.us/j/1'), false);
  assert.equal(isMeetLink(null), false);
}

// ── Google Calendar template ──────────────────────────────────────────────
{
  const url = new URL(
    googleCalendarUrl({
      title: 'Sprint review',
      startsAt: '2026-08-20T09:30:00.000Z',
      endsAt: '2026-08-20T10:00:00.000Z',
      details: 'Demo the payments work',
      location: 'Room 2',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    }),
  );

  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Sprint review');
  assert.equal(
    url.searchParams.get('dates'),
    '20260820T093000Z/20260820T100000Z',
    'Google wants basic-ISO UTC with no punctuation',
  );
  assert.equal(url.searchParams.get('location'), 'Room 2');
  assert.match(
    url.searchParams.get('details') ?? '',
    /Join: https:\/\/meet\.google\.com\/abc-defg-hij/,
    'the join link rides in details, where the mobile app keeps it clickable',
  );
}

{
  // A meeting with nothing but a title and times must still produce a valid URL.
  const url = new URL(googleCalendarUrl({ title: 'Standup', startsAt: '2026-08-20T09:00:00.000Z', endsAt: '2026-08-20T09:15:00.000Z' }));
  assert.equal(url.searchParams.get('details'), null, 'no empty details parameter is sent');
  assert.equal(url.searchParams.get('location'), null);
  assert.equal(url.searchParams.get('text'), 'Standup');
}

{
  // Titles with characters that would break a hand-built query string.
  const url = new URL(googleCalendarUrl({ title: 'Q&A / retro #3', startsAt: '2026-08-20T09:00:00.000Z', endsAt: '2026-08-20T10:00:00.000Z' }));
  assert.equal(url.searchParams.get('text'), 'Q&A / retro #3', 'ampersands and hashes survive encoding');
}

console.log('meeting-links: all checks passed');
