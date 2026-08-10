-- ============================================================================
-- 0006 · Chat, meetings, time tracking
-- ============================================================================
-- Socket.io is gone. Chat, presence-free live updates and board changes all
-- ride Supabase Realtime instead (wired up in 0010), which broadcasts row
-- changes through the same RLS the REST reads use — so a CLIENT account
-- cannot subscribe its way past a permission it does not have.
-- ============================================================================

create table public.channels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  name         text not null,
  topic        text,
  type         public.channel_type not null default 'CHANNEL',
  is_private   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index channels_workspace_idx on public.channels (workspace_id);
create index channels_project_idx on public.channels (project_id);

create table public.channel_members (
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index channel_members_user_idx on public.channel_members (user_id);

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel_id   uuid not null references public.channels (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null,
  mentions     uuid[] not null default '{}',
  parent_id    uuid references public.messages (id) on delete cascade,  -- thread root
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index messages_channel_created_idx on public.messages (channel_id, created_at desc);
create index messages_parent_idx on public.messages (parent_id);
create index messages_body_trgm on public.messages using gin (body extensions.gin_trgm_ops);

create table public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  unique (message_id, user_id, emoji)
);

alter table public.attachments
  add constraint attachments_message_id_fkey
  foreign key (message_id) references public.messages (id) on delete cascade;

-- ─────────────────────────── meetings ───────────────────────────

create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  title         text not null,
  agenda        text,
  notes         text,
  location      text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_by_id uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint meetings_times_ordered check (ends_at >= starts_at)
);

create index meetings_workspace_starts_idx on public.meetings (workspace_id, starts_at);

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     public.meeting_participant_status not null default 'INVITED',
  primary key (meeting_id, user_id)
);

create index meeting_participants_user_idx on public.meeting_participants (user_id);

-- Tasks created as meeting action items point back at their meeting.
alter table public.tasks
  add constraint tasks_meeting_id_fkey
  foreign key (meeting_id) references public.meetings (id) on delete set null;

create table public.holidays (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  date         date not null,
  unique (workspace_id, date, name)
);

-- ─────────────────────────── time ───────────────────────────

create table public.time_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete set null,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  seconds      integer not null default 0 check (seconds >= 0),
  note         text,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  is_running   boolean not null default false,
  day          date not null,               -- denormalised for cheap daily grouping
  constraint time_logs_running_has_no_end check (not (is_running and ended_at is not null))
);

create index time_logs_workspace_user_day_idx on public.time_logs (workspace_id, user_id, day);
create index time_logs_project_idx on public.time_logs (project_id);

-- One running timer per person. A partial unique index states the rule the old
-- API enforced with a read-then-write, which two tabs could race past.
create unique index time_logs_one_running_per_user
  on public.time_logs (user_id) where is_running;
