-- ============================================================================
-- 0009 · Row level security — identity, tenancy, projects, tasks
-- ============================================================================
-- This file and 0010 together replace apps/api/src/middleware/auth.ts. Where
-- the Express app checked permissions in one middleware and trusted every
-- query after it, the rule now travels with the data: a missed check is not a
-- leak, because there is no query path that skips the policy.
--
-- Conventions used throughout:
--   · read      → membership of the row's workspace
--   · write     → a named permission, resolved through the role matrix
--   · CLIENT    → additionally narrowed to projects they were added to
--   · service_role bypasses all of this, and is the only key allowed to run
--     the scheduled jobs and webhook handlers.
-- ============================================================================

/** Do the caller and this person share any workspace? Used by profile reads. */
create or replace function public.app_shares_workspace(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = p_user
  );
$$;

revoke execute on function public.app_shares_workspace(uuid) from public, anon;
grant execute on function public.app_shares_workspace(uuid) to authenticated, service_role;

-- ─────────────────────────── enable RLS everywhere ───────────────────────────
-- Default deny. Every table below gets explicit policies; anything added later
-- without one is unreachable rather than public, which is the safe failure.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'permissions', 'roles', 'role_permissions',
    'billing_plans', 'organizations', 'workspaces', 'departments', 'workspace_members', 'invites',
    'projects', 'project_members', 'board_columns', 'milestones', 'sprints', 'burndown_points',
    'tasks', 'subtasks', 'task_dependencies', 'labels', 'task_labels', 'comments',
    'folders', 'attachments', 'wiki_pages', 'wiki_versions',
    'channels', 'channel_members', 'messages', 'message_reactions',
    'meetings', 'meeting_participants', 'holidays', 'time_logs',
    'integrations', 'ai_suggestions', 'health_snapshots', 'embeddings', 'ask_logs',
    'notifications', 'activity_log', 'audit_log', 'settings', 'feature_flags'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ─────────────────────────── profiles ───────────────────────────

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.app_shares_workspace(id)
    or public.app_is_platform_admin()
  );

-- You may edit yourself, and you may not promote yourself: the two admin
-- columns are pinned to their current values by the WITH CHECK clause.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and is_platform_admin = (select p.is_platform_admin from public.profiles p where p.id = (select auth.uid()))
    and is_suspended = (select p.is_suspended from public.profiles p where p.id = (select auth.uid()))
  );

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.app_is_platform_admin())
  with check (public.app_is_platform_admin());

-- ─────────────────────────── reference data ───────────────────────────
-- The permission matrix and plan list are readable by any signed-in user (the
-- UI greys out actions from it) and writable only by the service role.

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy roles_read on public.roles for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy billing_plans_read on public.billing_plans for select to authenticated using (true);

create policy feature_flags_read on public.feature_flags for select to authenticated using (true);
create policy feature_flags_admin on public.feature_flags
  for all to authenticated
  using (public.app_is_platform_admin()) with check (public.app_is_platform_admin());

-- ─────────────────────────── organisations and workspaces ───────────────────────────

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.workspaces w
       where w.organization_id = id and public.app_is_member(w.id)
    )
    or public.app_is_platform_admin()
  );

-- Anyone signed in may found an organisation, but only as its own owner.
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy organizations_update on public.organizations
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.app_is_platform_admin())
  with check (owner_id = (select auth.uid()) or public.app_is_platform_admin());

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (public.app_is_member(id) or public.app_is_platform_admin());

create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (
    exists (
      select 1 from public.organizations o
       where o.id = organization_id and o.owner_id = (select auth.uid())
    )
  );

create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.app_has_permission(id, 'workspace.manage'))
  with check (public.app_has_permission(id, 'workspace.manage'));

create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (public.app_is_at_least(id, 'OWNER'));

-- ─────────────────────────── membership ───────────────────────────

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (public.app_is_member(workspace_id) or public.app_is_platform_admin());

create policy workspace_members_manage on public.workspace_members
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'member.manage'))
  with check (public.app_has_permission(workspace_id, 'member.manage'));

-- Everyone may edit their own row, but only the harmless parts of it. Role and
-- workspace are pinned so this cannot become a self-promotion path.
create policy workspace_members_update_self on public.workspace_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and role = (select m.role from public.workspace_members m where m.id = workspace_members.id)
  );

create policy departments_select on public.departments
  for select to authenticated using (public.app_is_member(workspace_id));

create policy departments_manage on public.departments
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'member.manage'))
  with check (public.app_has_permission(workspace_id, 'member.manage'));

-- An invite is readable by managers of its workspace, and by the person it was
-- addressed to — that second case is what lets the accept screen load before
-- the invitee is a member of anything.
create policy invites_select on public.invites
  for select to authenticated
  using (
    public.app_has_permission(workspace_id, 'member.manage')
    or lower(email) = lower((select p.email from public.profiles p where p.id = (select auth.uid())))
  );

create policy invites_manage on public.invites
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'member.manage'))
  with check (public.app_has_permission(workspace_id, 'member.manage'));

-- ─────────────────────────── projects ───────────────────────────

create policy projects_select on public.projects
  for select to authenticated
  using (public.app_is_member(workspace_id) and public.app_can_see_project(id));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.app_has_permission(workspace_id, 'project.create'));

create policy projects_update on public.projects
  for update to authenticated
  using (public.app_has_permission(workspace_id, 'project.update') and public.app_can_see_project(id))
  with check (public.app_has_permission(workspace_id, 'project.update'));

create policy projects_delete on public.projects
  for delete to authenticated
  using (public.app_has_permission(workspace_id, 'project.delete'));

create policy project_members_select on public.project_members
  for select to authenticated using (public.app_can_see_project(project_id));

create policy project_members_manage on public.project_members
  for all to authenticated
  using (
    exists (
      select 1 from public.projects pr
       where pr.id = project_id and public.app_has_permission(pr.workspace_id, 'project.update')
    )
  )
  with check (
    exists (
      select 1 from public.projects pr
       where pr.id = project_id and public.app_has_permission(pr.workspace_id, 'project.update')
    )
  );

create policy board_columns_select on public.board_columns
  for select to authenticated using (public.app_can_see_project(project_id));

create policy board_columns_manage on public.board_columns
  for all to authenticated
  using (
    exists (select 1 from public.projects pr
             where pr.id = project_id and public.app_has_permission(pr.workspace_id, 'project.update'))
  )
  with check (
    exists (select 1 from public.projects pr
             where pr.id = project_id and public.app_has_permission(pr.workspace_id, 'project.update'))
  );

create policy milestones_select on public.milestones
  for select to authenticated using (public.app_can_see_project(project_id));

create policy milestones_manage on public.milestones
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'project.update'))
  with check (public.app_has_permission(workspace_id, 'project.update'));

create policy sprints_select on public.sprints
  for select to authenticated using (public.app_can_see_project(project_id));

create policy sprints_manage on public.sprints
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'sprint.manage'))
  with check (public.app_has_permission(workspace_id, 'sprint.manage'));

create policy burndown_points_select on public.burndown_points
  for select to authenticated
  using (
    exists (select 1 from public.sprints s
             where s.id = sprint_id and public.app_can_see_project(s.project_id))
  );
-- Written by the nightly job under the service role only; no client policy.

-- ─────────────────────────── tasks ───────────────────────────

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.app_is_member(workspace_id) and public.app_can_see_project(project_id));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.app_has_permission(workspace_id, 'task.create')
    and public.app_can_see_project(project_id)
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.app_has_permission(workspace_id, 'task.update') and public.app_can_see_project(project_id))
  with check (public.app_has_permission(workspace_id, 'task.update'));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.app_has_permission(workspace_id, 'task.delete'));

create policy subtasks_select on public.subtasks
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

create policy subtasks_write on public.subtasks
  for all to authenticated
  using (
    exists (select 1 from public.tasks t
             where t.id = task_id and public.app_has_permission(t.workspace_id, 'task.update'))
  )
  with check (
    exists (select 1 from public.tasks t
             where t.id = task_id and public.app_has_permission(t.workspace_id, 'task.update'))
  );

create policy task_dependencies_select on public.task_dependencies
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = blocked_id));

create policy task_dependencies_write on public.task_dependencies
  for all to authenticated
  using (
    exists (select 1 from public.tasks t
             where t.id = blocked_id and public.app_has_permission(t.workspace_id, 'task.update'))
  )
  with check (
    exists (select 1 from public.tasks t
             where t.id = blocked_id and public.app_has_permission(t.workspace_id, 'task.update'))
  );

create policy labels_select on public.labels
  for select to authenticated using (public.app_is_member(workspace_id));

create policy labels_write on public.labels
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'task.update'))
  with check (public.app_has_permission(workspace_id, 'task.update'));

create policy task_labels_select on public.task_labels
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

create policy task_labels_write on public.task_labels
  for all to authenticated
  using (
    exists (select 1 from public.tasks t
             where t.id = task_id and public.app_has_permission(t.workspace_id, 'task.update'))
  )
  with check (
    exists (select 1 from public.tasks t
             where t.id = task_id and public.app_has_permission(t.workspace_id, 'task.update'))
  );

-- Comments: anyone who can see the task and holds comment.create may post, and
-- only the author may edit or remove their own.
create policy comments_select on public.comments
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.app_has_permission(workspace_id, 'comment.create')
    and exists (select 1 from public.tasks t where t.id = task_id)
  );

create policy comments_update_own on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy comments_delete on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.app_is_at_least(workspace_id, 'PM'));
