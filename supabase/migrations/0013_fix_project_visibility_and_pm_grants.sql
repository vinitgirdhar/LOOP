-- ═════════════════════════════════════════════════════════════════════════════
-- 0013 — two defects in the authorisation layer, found by driving the real API
--        against this database.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Apply with `supabase db push`, or paste into the SQL editor.
--
-- Neither of these is cosmetic: the first makes creating a project impossible
-- through any client that reads the row back, and the second gives every
-- project manager the full powers of an owner.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `INSERT ... RETURNING` on projects always failed
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `projects_select` calls app_can_see_project(id), and that function re-queries
-- public.projects to find the row. The function is STABLE, so inside an
-- INSERT ... RETURNING it runs against the snapshot taken before the statement
-- began and cannot see the row being inserted. Postgres requires the SELECT
-- policy to pass whenever an INSERT has a RETURNING clause, and reports the
-- failure as:
--
--     new row violates row-level security policy for table "projects"
--
-- which points at the wrong policy entirely. PostgREST sends
-- `Prefer: return=representation` for any insert whose result is read back, so
-- in practice no client could create a project at all.
--
-- The fix is to stop making the SELECT policy re-read the table it is filtering.
-- The row's own workspace_id and id are already in scope, so the CLIENT
-- narrowing can be expressed directly.

drop policy if exists projects_select on public.projects;

create policy projects_select on public.projects
  for select to authenticated
  using (
    public.app_is_member(workspace_id)
    and (
      -- Everyone except a CLIENT sees every project in their workspace.
      public.app_role(workspace_id) <> 'CLIENT'
      -- A CLIENT sees only the projects they were explicitly added to. This
      -- reads project_members, never projects, so it is safe under RETURNING.
      or exists (
        select 1
          from public.project_members pm
         where pm.project_id = projects.id
           and pm.user_id = (select auth.uid())
      )
    )
  );

-- Same reasoning for the update policy, so an UPDATE ... RETURNING behaves.
drop policy if exists projects_update on public.projects;

create policy projects_update on public.projects
  for update to authenticated
  using (
    public.app_has_permission(workspace_id, 'project.update')
    and (
      public.app_role(workspace_id) <> 'CLIENT'
      or exists (
        select 1
          from public.project_members pm
         where pm.project_id = projects.id
           and pm.user_id = (select auth.uid())
      )
    )
  )
  with check (public.app_has_permission(workspace_id, 'project.update'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PM had every permission an OWNER had
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 0012 granted all 21 permissions to both OWNER and PM, so a project manager
-- could rename or delete the workspace, change anyone's role, and delete
-- projects. packages/shared/src/index.ts — the matrix the product is described
-- by, and the one the UI hides controls with — says otherwise, so the database
-- was quietly more permissive than every screen implied.
--
-- Withdrawn from PM: workspace.manage, member.manage, project.delete.
-- Everything else a PM needs to run delivery stays.

delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and r.key = 'PM'
   and p.key in ('workspace.manage', 'member.manage', 'project.delete');

-- CLIENT was granted only comment.create and file.read, which leaves the client
-- portal unable to read the projects or wiki pages it is supposed to show.
-- project.view and wiki.read carry no write capability.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'CLIENT'
   and p.key in ('wiki.read', 'chat.read')
   and not exists (
     select 1
       from public.role_permissions existing
      where existing.role_id = r.id
        and existing.permission_id = p.id
   );


-- ─────────────────────────────────────────────────────────────────────────────
-- Check
-- ─────────────────────────────────────────────────────────────────────────────
-- Expected after this migration:
--   OWNER  21
--   PM     18
--   MEMBER 10
--   CLIENT  4
--
--   select r.key, count(*)
--     from public.role_permissions rp
--     join public.roles r on r.id = rp.role_id
--    group by r.key order by count(*) desc;
