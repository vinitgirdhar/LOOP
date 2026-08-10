-- ============================================================================
-- 0002 · Identity and RBAC
-- ============================================================================
-- Supabase Auth owns credentials, so the whole custom auth surface from the
-- Express API disappears here:
--
--   users.password_hash      → auth.users.encrypted_password
--   sessions                 → Supabase refresh tokens (rotation built in)
--   verification_tokens      → Supabase email confirmation / recovery
--   two_factor_secret / _on  → Supabase MFA (auth.mfa_factors)
--   google_id                → auth.identities
--
-- What remains is a profile row per auth user, holding only the product's own
-- fields. It is keyed by auth.users.id so a deleted account cascades cleanly.
-- ============================================================================

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  name              text not null,
  avatar_url        text,
  -- Which of the three mascots this person shows when they have no picture.
  -- Resolved once here rather than re-derived from a hash on every client.
  mascot            text not null default 'ava' check (mascot in ('ava', 'ben', 'cleo')),
  is_platform_admin boolean not null default false,
  is_suspended      boolean not null default false,
  timezone          text not null default 'UTC',
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_name_trgm on public.profiles using gin (name extensions.gin_trgm_ops);

comment on table public.profiles is
  'Product-owned user fields. Credentials, sessions and MFA live in auth.*';

-- ─────────────────────────── RBAC ───────────────────────────
-- Permissions stay data rather than code so the matrix can be inspected and
-- changed without a deploy. RLS policies call app_has_permission(), which
-- resolves through these three tables.

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,        -- 'task.update'
  description text not null
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         public.workspace_role not null unique,
  name        text not null,
  description text not null,
  rank        integer not null             -- higher = more power, for "at least" checks
);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx on public.role_permissions (permission_id);
