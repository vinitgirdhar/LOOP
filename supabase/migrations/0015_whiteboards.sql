-- ============================================================================
-- 0015 · Whiteboards / mind maps
-- ============================================================================
-- A free-form canvas per workspace, optionally attached to a project.
--
-- The scene is one jsonb document rather than node and edge tables. That is a
-- deliberate trade: a whiteboard is only ever read and written whole, nobody
-- queries "all nodes coloured blue", and a single document means a save is one
-- atomic write instead of a diff across two tables. If querying inside scenes
-- is ever needed, a GIN index on the column adds it without a migration of the
-- shape.
--
-- Reads follow workspace membership. Writes reuse `wiki.write`, because a
-- whiteboard is knowledge content in exactly the way a wiki page is — which
-- also means a CLIENT account cannot edit one, since it holds neither.
-- ============================================================================

create table public.whiteboards (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,

  title        text not null default 'Untitled board',
  kind         text not null default 'mindmap' check (kind in ('mindmap', 'whiteboard')),

  -- { nodes: [{ id, x, y, text, colour, shape, parentId }], edges: [{ from, to }] }
  scene        jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,

  created_by   uuid references public.profiles (id) on delete set null,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A runaway client must not be able to write an unbounded document.
  constraint whiteboards_scene_is_object check (jsonb_typeof(scene) = 'object'),
  constraint whiteboards_scene_bounded check (pg_column_size(scene) < 1048576)
);

create index whiteboards_workspace_idx on public.whiteboards (workspace_id, updated_at desc);
create index whiteboards_project_idx on public.whiteboards (project_id);

comment on table public.whiteboards is
  'Free-form mind map / whiteboard scenes. One jsonb document per board; read on membership, written by wiki.write holders.';

-- Keeps updated_at honest without every caller remembering to set it.
create trigger set_updated_at
  before update on public.whiteboards
  for each row execute function public.set_updated_at();

-- ─────────────────────────── row level security ───────────────────────────

alter table public.whiteboards enable row level security;

create policy whiteboards_read on public.whiteboards
  for select
  to authenticated
  using (public.app_is_member(workspace_id));

create policy whiteboards_insert on public.whiteboards
  for insert
  to authenticated
  with check (public.app_has_permission(workspace_id, 'wiki.write'));

create policy whiteboards_update on public.whiteboards
  for update
  to authenticated
  using (public.app_has_permission(workspace_id, 'wiki.write'))
  with check (public.app_has_permission(workspace_id, 'wiki.write'));

create policy whiteboards_delete on public.whiteboards
  for delete
  to authenticated
  using (public.app_has_permission(workspace_id, 'wiki.write'));

revoke all on public.whiteboards from anon;

-- Live cursors and co-editing ride the same realtime channel as the rest.
alter publication supabase_realtime add table public.whiteboards;

-- ─────────────────────────────────────────────────────────────────────────────
-- Check
-- ─────────────────────────────────────────────────────────────────────────────
--   select count(*) from public.whiteboards;                             -- 0
--   select policyname from pg_policies where tablename = 'whiteboards';  -- 4 rows
