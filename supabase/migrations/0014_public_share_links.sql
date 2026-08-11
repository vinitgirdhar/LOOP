-- ============================================================================
-- 0014 · Public project pages / guest link access
-- ============================================================================
-- A read-only window onto one project for somebody with no account at all.
--
-- Design notes, because this is the only place in the product where data
-- leaves the authenticated perimeter:
--
--   · The token is stored **hashed**, never in plaintext. It is shown to the
--     person who created it exactly once. A dump of this table therefore
--     yields no working links — the same reason password_hash exists.
--   · There are deliberately NO anon RLS policies on projects or tasks. The
--     public route handler runs with the service role, validates the token
--     itself, and returns an explicit field allowlist. Widening RLS for anon
--     would put the whole tenancy model one policy bug away from a leak.
--   · Scopes are opt-in per link, so "share progress" never accidentally means
--     "share the wiki".
--   · Revocation and expiry are both first class, and both are checked on
--     every request rather than at mint time.
-- ============================================================================

create table public.project_share_links (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,

  -- sha256 of the token, hex encoded. The plaintext never lands here.
  token_hash   text not null unique,
  -- First 8 chars of the token, so the UI can say which link is which without
  -- being able to reconstruct one.
  token_hint   text not null,

  label        text,
  scopes       text[] not null default array['progress']::text[],

  expires_at   timestamptz,
  revoked_at   timestamptz,

  view_count   integer not null default 0,
  last_seen_at timestamptz,

  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint project_share_links_scopes_known check (
    scopes <@ array['progress', 'tasks', 'docs', 'milestones']::text[]
  ),
  constraint project_share_links_scopes_present check (array_length(scopes, 1) >= 1)
);

create index project_share_links_project_idx on public.project_share_links (project_id);
create index project_share_links_workspace_idx on public.project_share_links (workspace_id);

comment on table public.project_share_links is
  'Read-only guest access to a single project. Token is hashed; resolution happens in the service-role route handler, not through anon RLS.';

-- ─────────────────────────── row level security ───────────────────────────
-- Members of the workspace manage their own links. `anon` is granted nothing:
-- the public page never queries this table with a user session.

alter table public.project_share_links enable row level security;

create policy project_share_links_read on public.project_share_links
  for select
  to authenticated
  using (public.app_is_member(workspace_id));

create policy project_share_links_write on public.project_share_links
  for all
  to authenticated
  using (public.app_has_permission(workspace_id, 'project.update'))
  with check (public.app_has_permission(workspace_id, 'project.update'));

revoke all on public.project_share_links from anon;

-- ─────────────────────────── view counter ───────────────────────────
-- Called by the public route with the service role. Bumping the count through
-- a function keeps the handler to a single round trip and means the counter
-- cannot drift if a future caller forgets to update last_seen_at.

create or replace function public.app_touch_share_link(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.project_share_links
     set view_count = view_count + 1,
         last_seen_at = now()
   where id = p_id;
$$;

revoke execute on function public.app_touch_share_link(uuid) from public, anon, authenticated;
grant execute on function public.app_touch_share_link(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Check
-- ─────────────────────────────────────────────────────────────────────────────
--   select count(*) from public.project_share_links;                  -- 0
--   select rolname from pg_roles where rolname = 'anon';              -- exists
--   -- must return no rows: anon has no grant on the table
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'project_share_links' and grantee = 'anon';
