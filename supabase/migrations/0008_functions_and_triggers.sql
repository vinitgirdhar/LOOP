-- ============================================================================
-- 0008 · Functions and triggers
-- ============================================================================
-- The authorisation helpers below are the load-bearing part of this schema.
-- Three properties they all share, and why:
--
--   SECURITY DEFINER  They read workspace_members. A policy *on* that table
--                     that queried it directly would recurse forever, so the
--                     lookup has to run as the owner and bypass RLS.
--   STABLE            Lets the planner call them once per statement instead of
--                     once per row. On a 500-task board that is the difference
--                     between one membership lookup and five hundred.
--   search_path = ''  A SECURITY DEFINER function with a mutable search_path
--                     can be hijacked by a caller-created schema. Everything
--                     is schema-qualified instead.
-- ============================================================================

-- ─────────────────────────── authorisation helpers ───────────────────────────

create or replace function public.app_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin
       from public.profiles p
      where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function public.app_is_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.workspace_id = p_workspace
       and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.app_role(p_workspace uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
    from public.workspace_members m
   where m.workspace_id = p_workspace
     and m.user_id = (select auth.uid());
$$;

/**
 * True when the caller's role in this workspace carries the named permission.
 * The matrix lives in permissions/roles/role_permissions, so changing what a
 * PM may do is a data change rather than a migration.
 */
create or replace function public.app_has_permission(p_workspace uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
      join public.roles r on r.key = m.role
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions perm on perm.id = rp.permission_id
     where m.workspace_id = p_workspace
       and m.user_id = (select auth.uid())
       and perm.key = p_permission
  );
$$;

/** Rank comparison, for the "at least a PM" style checks. */
create or replace function public.app_is_at_least(p_workspace uuid, p_role public.workspace_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select mine.rank >= needed.rank
       from public.workspace_members m
       join public.roles mine on mine.key = m.role
       join public.roles needed on needed.key = p_role
      where m.workspace_id = p_workspace
        and m.user_id = (select auth.uid())),
    false
  );
$$;

/**
 * Whether the caller may see a project at all.
 *
 * Everyone in the workspace sees every project except a CLIENT, who is
 * restricted to the projects they have been explicitly added to. This is the
 * boundary the product's whole client-portal promise rests on.
 */
create or replace function public.app_can_see_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.projects pr
      join public.workspace_members m
        on m.workspace_id = pr.workspace_id
       and m.user_id = (select auth.uid())
     where pr.id = p_project
       and (
         m.role <> 'CLIENT'
         or exists (
           select 1
             from public.project_members pm
            where pm.project_id = pr.id
              and pm.user_id = (select auth.uid())
         )
       )
  );
$$;

create or replace function public.app_is_channel_member(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.channel_members cm
     where cm.channel_id = p_channel
       and cm.user_id = (select auth.uid())
  );
$$;

-- Callable by signed-in users only; the anon role must never probe membership.
revoke execute on function
  public.app_is_platform_admin(),
  public.app_is_member(uuid),
  public.app_role(uuid),
  public.app_has_permission(uuid, text),
  public.app_is_at_least(uuid, public.workspace_role),
  public.app_can_see_project(uuid),
  public.app_is_channel_member(uuid)
from public, anon;

grant execute on function
  public.app_is_platform_admin(),
  public.app_is_member(uuid),
  public.app_role(uuid),
  public.app_has_permission(uuid, text),
  public.app_is_at_least(uuid, public.workspace_role),
  public.app_can_see_project(uuid),
  public.app_is_channel_member(uuid)
to authenticated, service_role;

-- ─────────────────────────── new user → profile ───────────────────────────

/**
 * Mirrors a fresh auth.users row into profiles.
 *
 * The mascot is chosen here, once, from the uuid — so the face a person gets
 * is stable for the life of the account and every client agrees on it without
 * re-deriving a hash.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_mascot text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  v_mascot := (array['ava', 'ben', 'cleo'])[1 + (('x' || substr(md5(new.id::text), 1, 8))::bit(32)::bigint % 3)];

  insert into public.profiles (id, email, name, avatar_url, mascot)
  values (
    new.id,
    new.email,
    v_name,
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    v_mascot
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/** Keeps profiles.email in step when someone changes it through Supabase Auth. */
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ─────────────────────────── housekeeping triggers ───────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'organizations', 'workspaces', 'projects', 'sprints', 'tasks', 'wiki_pages', 'feature_flags'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t
    );
  end loop;
end;
$$;

/**
 * Per-project task numbering (PAY-1, PAY-2 …).
 *
 * A plain max()+1 races: two inserts in the same instant both read the same
 * maximum and one violates the unique constraint. The advisory lock serialises
 * inserts per project only, and is released when the transaction ends.
 */
create or replace function public.assign_task_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null or new.number = 0 then
    perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 0));
    select coalesce(max(t.number), 0) + 1
      into new.number
      from public.tasks t
     where t.project_id = new.project_id;
  end if;
  return new;
end;
$$;

create trigger assign_task_number
  before insert on public.tasks
  for each row execute function public.assign_task_number();

-- The column is NOT NULL, so the trigger needs a value to overwrite.
alter table public.tasks alter column number set default 0;

/** Any write to a task counts as activity — the health score reads this. */
create or replace function public.touch_task_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_activity_at := now();
  -- Completion is derived from the board column rather than set by hand, so a
  -- drag on the board and an API write cannot disagree about it.
  if new.status is distinct from old.status then
    if exists (
      select 1 from public.board_columns c
       where c.project_id = new.project_id and c.key = new.status and c.is_done
    ) then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger touch_task_activity
  before update on public.tasks
  for each row execute function public.touch_task_activity();

-- ─────────────────────────── retrieval ───────────────────────────

/**
 * Vector search for Ask the Workspace.
 *
 * Permission is applied *before* retrieval, not after: the caller's membership
 * is checked, and a CLIENT is narrowed to SHARED rows in projects they belong
 * to. A model can only cite what this function was willing to return.
 */
create or replace function public.match_embeddings(
  p_workspace uuid,
  p_query extensions.vector(768),
  p_limit integer default 8,
  p_threshold double precision default 0.72
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  title text,
  content text,
  url text,
  similarity double precision
)
language sql
stable
security invoker           -- deliberately: the RLS on embeddings still applies
set search_path = ''
as $$
  select e.id,
         e.source_type,
         e.source_id,
         e.title,
         e.content,
         e.url,
         1 - (e.vector operator(extensions.<=>) p_query) as similarity
    from public.embeddings e
   where e.workspace_id = p_workspace
     and e.vector is not null
     and 1 - (e.vector operator(extensions.<=>) p_query) >= p_threshold
   order by e.vector operator(extensions.<=>) p_query
   limit least(coalesce(p_limit, 8), 25);
$$;

grant execute on function public.match_embeddings(uuid, extensions.vector, integer, double precision)
  to authenticated, service_role;
