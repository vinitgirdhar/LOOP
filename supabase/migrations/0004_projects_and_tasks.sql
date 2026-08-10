-- ============================================================================
-- 0004 · Projects, boards, sprints, tasks
-- ============================================================================

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key          text not null,                       -- 'PAY' → PAY-42
  name         text not null,
  description  text,
  status       public.project_status not null default 'ACTIVE',
  priority     public.priority not null default 'MEDIUM',
  start_date   timestamptz,
  deadline     timestamptz,
  color        text not null default '#131314',
  auto_apply   boolean not null default false,      -- auto-apply high-confidence suggestions
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, key)
);

create index projects_workspace_status_idx on public.projects (workspace_id, status);

create table public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('lead', 'member', 'viewer')),
  added_at   timestamptz not null default now(),
  unique (project_id, user_id)
);

create index project_members_user_idx on public.project_members (user_id);

create table public.board_columns (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key        text not null,                         -- stable id referenced by tasks.status
  name       text not null,
  "order"    integer not null,
  is_done    boolean not null default false,
  wip_limit  integer,
  color      text not null default '#94a3b8',
  unique (project_id, key)
);

create index board_columns_project_order_idx on public.board_columns (project_id, "order");

create table public.milestones (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null,
  description  text,
  due_date     timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index milestones_project_idx on public.milestones (project_id);

create table public.sprints (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null,
  goal         text,
  status       public.sprint_status not null default 'PLANNED',
  start_date   timestamptz not null,
  end_date     timestamptz not null,
  capacity     integer not null default 40,          -- story points
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint sprints_dates_ordered check (end_date >= start_date)
);

create index sprints_project_status_idx on public.sprints (project_id, status);

-- Written nightly by a scheduled job so burndown is real history, not a
-- straight line drawn between two points at render time.
create table public.burndown_points (
  id              uuid primary key default gen_random_uuid(),
  sprint_id       uuid not null references public.sprints (id) on delete cascade,
  date            date not null,
  remaining_pts   integer not null,
  completed_pts   integer not null,
  remaining_tasks integer not null,
  unique (sprint_id, date)
);

-- ─────────────────────────── tasks ───────────────────────────

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  number           integer not null,                 -- per project, assigned by trigger
  title            text not null,
  description      text,
  status           text not null default 'backlog',  -- matches board_columns.key
  priority         public.priority not null default 'MEDIUM',
  story_points     integer,
  estimate_hrs     double precision,
  due_date         timestamptz,
  start_date       timestamptz,
  completed_at     timestamptz,
  "order"          double precision not null default 1000,  -- position within its column
  is_blocked       boolean not null default false,
  blocked_note     text,
  recurrence       text check (recurrence is null or recurrence in ('none', 'daily', 'weekly', 'monthly')),
  recur_until      timestamptz,
  assignee_id      uuid references public.profiles (id) on delete set null,
  reporter_id      uuid references public.profiles (id) on delete set null,
  sprint_id        uuid references public.sprints (id) on delete set null,
  milestone_id     uuid references public.milestones (id) on delete set null,
  parent_id        uuid references public.tasks (id) on delete set null,
  meeting_id       uuid,                             -- FK added in 0006, meetings not created yet
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, number)
);

create index tasks_workspace_idx on public.tasks (workspace_id);
create index tasks_project_status_idx on public.tasks (project_id, status);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_sprint_idx on public.tasks (sprint_id);
create index tasks_due_date_idx on public.tasks (due_date) where completed_at is null;
create index tasks_parent_idx on public.tasks (parent_id);
create index tasks_title_trgm on public.tasks using gin (title extensions.gin_trgm_ops);

create table public.subtasks (
  id      uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title   text not null,
  done    boolean not null default false,
  "order" integer not null default 0
);

create index subtasks_task_idx on public.subtasks (task_id);

create table public.task_dependencies (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.tasks (id) on delete cascade,  -- must finish first
  blocked_id uuid not null references public.tasks (id) on delete cascade,
  unique (blocker_id, blocked_id),
  constraint task_dependencies_no_self_block check (blocker_id <> blocked_id)
);

create index task_dependencies_blocked_idx on public.task_dependencies (blocked_id);

create table public.labels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  name         text not null,
  color        text not null default '#64748b'
);

-- A null project_id means workspace-wide. NULLs are not equal to each other in
-- a plain unique constraint, so the two cases need separate partial indexes or
-- duplicates slip through.
create unique index labels_workspace_project_name_key
  on public.labels (workspace_id, project_id, name) where project_id is not null;
create unique index labels_workspace_name_key
  on public.labels (workspace_id, name) where project_id is null;

create table public.task_labels (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (task_id, label_id)
);

create index task_labels_label_idx on public.task_labels (label_id);

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  task_id      uuid not null references public.tasks (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null,
  mentions     uuid[] not null default '{}',
  edited_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index comments_task_idx on public.comments (task_id, created_at);
