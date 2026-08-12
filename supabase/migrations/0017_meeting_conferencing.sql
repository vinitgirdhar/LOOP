-- ============================================================================
-- 0017 · Meeting conferencing links
-- ============================================================================
-- `meetings` carried a single free-text `location`, so a video call and a
-- room number were the same field and nothing could render a "Join" button.
--
-- Scope note, stated plainly: this stores and surfaces a conference link and
-- builds Google Calendar deep links from it. It does not *provision* a Meet
-- room, because doing that requires the Google Calendar API with an OAuth
-- consent for the calendar scope and a stored per-user refresh token. Sign-in
-- here uses Supabase's Google provider with no calendar scope, so the honest
-- options were "store the link the organiser creates" or "pretend". This is
-- the first one.
-- ============================================================================

alter table public.meetings
  add column if not exists meeting_url text,
  add column if not exists conference_provider text
    check (conference_provider is null or conference_provider in ('google_meet', 'zoom', 'teams', 'other'));

comment on column public.meetings.meeting_url is
  'Video call link. Rendered as a Join button and embedded in the calendar deep link and the .ics file.';

-- A link that is not a link is a broken button, so the shape is checked here
-- rather than trusted from the client.
alter table public.meetings
  drop constraint if exists meetings_url_is_http;

alter table public.meetings
  add constraint meetings_url_is_http
  check (meeting_url is null or meeting_url ~* '^https?://[^\s]+$');

-- ─────────────────────────────────────────────────────────────────────────────
-- Check
-- ─────────────────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_name = 'meetings' and column_name in ('meeting_url', 'conference_provider');
--   -- expect 2 rows
