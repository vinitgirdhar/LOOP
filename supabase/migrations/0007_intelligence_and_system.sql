-- ============================================================================
-- 0007 · Auto-Pilot, health, retrieval, and system tables
-- ============================================================================

create table public.integrations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  provider     text not null,                       -- github | google_calendar | slack
  config       jsonb not null default '{}'::jsonb,  -- { "repo": "org/name" }
  -- Webhook secrets never belong in a client-readable row; this column is
  -- withheld by the RLS policy in 0009 and only the service role reads it.
  secret       text,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);

create unique index integrations_workspace_provider_project_key
  on public.integrations (workspace_id, provider, project_id) where project_id is not null;
create unique index integrations_workspace_provider_key
  on public.integrations (workspace_id, provider) where project_id is null;

create table public.ai_suggestions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete cascade,
  task_id         uuid references public.tasks (id) on delete cascade,
  kind            public.suggestion_kind not null,
  title           text not null,
  rationale       text not null,
  evidence        jsonb not null default '[]'::jsonb,  -- [{ type, label, url, quote }]
  confidence      double precision not null default 0.5 check (confidence between 0 and 1),
  proposed_change jsonb not null default '{}'::jsonb,  -- { field, from, to }
  status          public.suggestion_status not null default 'PENDING',
  source          text not null default 'rules' check (source in ('rules', 'ai')),
  decided_by_id   uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index ai_suggestions_workspace_status_idx on public.ai_suggestions (workspace_id, status);
create index ai_suggestions_task_idx on public.ai_suggestions (task_id);

comment on column public.ai_suggestions.source is
  'rules = deterministic engine (may auto-apply above 0.9); ai = model-matched, never auto-applies';

create table public.health_snapshots (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  score        integer not null check (score between 0 and 100),
  signals      jsonb not null default '[]'::jsonb,  -- [{ key, label, value, weight, contribution }]
  actions      jsonb not null default '[]'::jsonb,  -- top three fixes
  narrative    text,
  created_at   timestamptz not null default now()
);

create index health_snapshots_project_created_idx on public.health_snapshots (project_id, created_at desc);

-- 768 dimensions matches Gemini's text-embedding-004, the provider the API used.
create table public.embeddings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  source_type  text not null check (source_type in ('task', 'wiki', 'message', 'comment', 'commit')),
  source_id    uuid not null,
  title        text not null,
  content      text not null,
  url          text,
  visibility   public.embedding_visibility not null default 'INTERNAL',
  vector       extensions.vector(768),
  created_at   timestamptz not null default now(),
  unique (source_type, source_id)
);

create index embeddings_workspace_visibility_idx on public.embeddings (workspace_id, visibility);

-- IVFFlat needs rows before it can build meaningful lists; on an empty table
-- this index is created and simply unused until the first ANALYZE after
-- ingestion. Revisit `lists` once the corpus is above ~100k rows.
create index embeddings_vector_idx on public.embeddings
  using ivfflat (vector extensions.vector_cosine_ops) with (lists = 100);

create table public.ask_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  question     text not null,
  answer       text not null,
  citations    jsonb not null default '[]'::jsonb,
  model        text not null,
  created_at   timestamptz not null default now()
);

create index ask_logs_workspace_created_idx on public.ask_logs (workspace_id, created_at desc);

-- ─────────────────────────── activity, audit, notifications ───────────────────────────

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  type         public.notification_type not null,
  title        text not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  type         text not null,                       -- task.created, github.push …
  message      text not null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index activity_log_workspace_created_idx on public.activity_log (workspace_id, created_at desc);
create index activity_log_project_created_idx on public.activity_log (project_id, created_at desc);
create index activity_log_task_idx on public.activity_log (task_id, created_at desc);

-- Append-only by policy: 0009 grants no update or delete to any client role.
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,                       -- auth.login, suggestion.accepted …
  entity       text not null,
  entity_id    uuid,
  meta         jsonb not null default '{}'::jsonb,
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index audit_log_workspace_created_idx on public.audit_log (workspace_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action);

-- ─────────────────────────── settings ───────────────────────────

create table public.settings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  scope        text not null default 'workspace' check (scope in ('workspace', 'system')),
  key          text not null,
  value        jsonb not null default '{}'::jsonb
);

create unique index settings_workspace_key on public.settings (workspace_id, key) where workspace_id is not null;
create unique index settings_system_key on public.settings (key) where workspace_id is null;

create table public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  description text not null,
  enabled     boolean not null default false,
  rollout     integer not null default 0 check (rollout between 0 and 100),
  updated_at  timestamptz not null default now()
);
