-- ============================================================================
-- 0005 · Files and wiki
-- ============================================================================
-- Cloudinary and the local disk fallback are both replaced by Supabase
-- Storage. attachments now records the object's storage_path inside the
-- 'attachments' bucket (created in 0010) rather than a public URL, so access
-- goes through a signed URL and stays subject to the same membership rules as
-- the row that describes it.
-- ============================================================================

create table public.folders (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  parent_id    uuid references public.folders (id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

create index folders_workspace_project_idx on public.folders (workspace_id, project_id);
create index folders_parent_idx on public.folders (parent_id);

create table public.attachments (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete cascade,
  task_id        uuid references public.tasks (id) on delete cascade,
  message_id     uuid,                       -- FK added in 0006, messages not created yet
  wiki_page_id   uuid,                       -- FK added below, wiki_pages not created yet
  folder_id      uuid references public.folders (id) on delete set null,
  name           text not null,
  -- Object key inside the 'attachments' bucket. Always '<workspace_id>/...',
  -- which is what the storage policies match on.
  storage_path   text not null,
  mime           text not null,
  size           bigint not null check (size >= 0),
  version        integer not null default 1,
  replaces_id    uuid unique references public.attachments (id) on delete set null,
  uploaded_by_id uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint attachments_path_is_workspace_scoped
    check (storage_path like (workspace_id::text || '/%'))
);

create index attachments_workspace_project_idx on public.attachments (workspace_id, project_id);
create index attachments_task_idx on public.attachments (task_id);
create index attachments_folder_idx on public.attachments (folder_id);

-- ─────────────────────────── wiki ───────────────────────────

create table public.wiki_pages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  parent_id    uuid references public.wiki_pages (id) on delete cascade,
  title        text not null,
  slug         text not null,
  content      text not null default '',
  -- The single flag a CLIENT account's read policy keys off.
  is_shared    boolean not null default false,
  version      integer not null default 1,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, slug)
);

create index wiki_pages_workspace_idx on public.wiki_pages (workspace_id);
create index wiki_pages_parent_idx on public.wiki_pages (parent_id);
create index wiki_pages_title_trgm on public.wiki_pages using gin (title extensions.gin_trgm_ops);

create table public.wiki_versions (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.wiki_pages (id) on delete cascade,
  version    integer not null,
  title      text not null,
  content    text not null,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (page_id, version)
);

alter table public.attachments
  add constraint attachments_wiki_page_id_fkey
  foreign key (wiki_page_id) references public.wiki_pages (id) on delete cascade;
