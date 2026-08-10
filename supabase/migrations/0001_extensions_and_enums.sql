-- ============================================================================
-- 0001 · Extensions and enums
-- ============================================================================
-- Run order matters: every later migration depends on the types declared here.
--
-- Enum *values* are deliberately kept in the SCREAMING_CASE the existing
-- frontend already keys off (ROLE_LABELS.OWNER, PRIORITY_STYLE.URGENT,
-- STATUS_STYLE.ACTIVE …). Renaming them to lower case would be tidier SQL and
-- would silently break every badge and label in the web app.
-- ============================================================================

create extension if not exists "pgcrypto"   with schema extensions;  -- gen_random_uuid()
create extension if not exists "pg_trgm"    with schema extensions;  -- fuzzy search
create extension if not exists "vector"     with schema extensions;  -- RAG embeddings

-- ─────────────────────────── enums ───────────────────────────

create type public.workspace_role as enum ('OWNER', 'PM', 'MEMBER', 'CLIENT');

create type public.project_status as enum ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

create type public.priority as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

create type public.sprint_status as enum ('PLANNED', 'ACTIVE', 'COMPLETED');

create type public.channel_type as enum ('CHANNEL', 'DM');

create type public.suggestion_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'AUTO_APPLIED');

create type public.suggestion_kind as enum (
  'MOVE_STATUS', 'FLAG_BLOCKED', 'ASSIGN', 'LINK_COMMIT', 'SPRINT_PLAN', 'ESTIMATE'
);

create type public.notification_type as enum (
  'TASK_ASSIGNED', 'TASK_COMPLETED', 'DEADLINE_REMINDER', 'MENTION', 'FILE_UPLOADED',
  'COMMENT_ADDED', 'SPRINT_STARTED', 'SPRINT_ENDED', 'SUGGESTION', 'INVITE'
);

create type public.meeting_participant_status as enum ('INVITED', 'ACCEPTED', 'DECLINED');

-- INTERNAL rows are never retrievable by a CLIENT account; SHARED ones are.
create type public.embedding_visibility as enum ('INTERNAL', 'SHARED');
