-- ============================================================================
-- 0003 · Tenancy: organisations, workspaces, membership, invites
-- ============================================================================
-- The multi-tenant rule from the original schema is unchanged and is now
-- enforced by the database rather than by hand in every query: every business
-- table carries workspace_id, and its RLS policy checks membership of that
-- workspace. workspace_members is the table the whole policy layer pivots on.
-- ============================================================================

create table public.billing_plans (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  price_monthly integer not null default 0,
  seats         integer not null default 5,
  features      jsonb not null default '[]'::jsonb
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  owner_id   uuid not null references public.profiles (id) on delete restrict,
  plan_id    uuid references public.billing_plans (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_owner_idx on public.organizations (owner_id);

create table public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  slug            text not null unique,
  logo_url        text,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index workspaces_organization_idx on public.workspaces (organization_id);

create table public.departments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          public.workspace_role not null default 'MEMBER',
  department_id uuid references public.departments (id) on delete set null,
  title         text,
  capacity_hrs  integer not null default 40,   -- weekly, drives workload + sprint planning
  joined_at     timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- Every RLS check on every table funnels through a lookup on this pair, so it
-- is the one index in the schema that genuinely affects overall throughput.
create index workspace_members_user_workspace_idx on public.workspace_members (user_id, workspace_id);
create index workspace_members_workspace_idx on public.workspace_members (workspace_id);

create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  email         text not null,
  role          public.workspace_role not null default 'MEMBER',
  token         text not null unique,
  invited_by_id uuid not null references public.profiles (id) on delete cascade,
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index invites_workspace_email_idx on public.invites (workspace_id, lower(email));
create index invites_token_idx on public.invites (token) where accepted_at is null;
