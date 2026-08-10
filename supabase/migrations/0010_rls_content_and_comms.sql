-- ============================================================================
-- 0010 · Row level security — files, wiki, chat, meetings, time, intelligence
-- ============================================================================
-- The two boundaries this file exists to enforce, both of which the product
-- makes a promise about on the marketing page:
--
--   1. A CLIENT account has no chat permission at all, so no policy here
--      grants it a route to messages or channels.
--   2. A CLIENT sees only wiki pages explicitly marked is_shared, in projects
--      they belong to. Retrieval for the AI answers the same rule, because it
--      reads through the same policies.
-- ============================================================================

-- ─────────────────────────── files ───────────────────────────

create policy folders_select on public.folders
  for select to authenticated
  using (
    public.app_is_member(workspace_id)
    and (project_id is null or public.app_can_see_project(project_id))
  );

create policy folders_write on public.folders
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'file.upload'))
  with check (public.app_has_permission(workspace_id, 'file.upload'));

create policy attachments_select on public.attachments
  for select to authenticated
  using (
    public.app_has_permission(workspace_id, 'file.read')
    and (project_id is null or public.app_can_see_project(project_id))
  );

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by_id = (select auth.uid())
    and public.app_has_permission(workspace_id, 'file.upload')
  );

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    uploaded_by_id = (select auth.uid())
    or public.app_has_permission(workspace_id, 'file.delete')
  );

-- ─────────────────────────── wiki ───────────────────────────

create policy wiki_pages_select on public.wiki_pages
  for select to authenticated
  using (
    public.app_can_see_project(project_id)
    and (
      public.app_role(workspace_id) <> 'CLIENT'
      or is_shared
    )
  );

create policy wiki_pages_write on public.wiki_pages
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'wiki.write') and public.app_can_see_project(project_id))
  with check (public.app_has_permission(workspace_id, 'wiki.write'));

create policy wiki_versions_select on public.wiki_versions
  for select to authenticated
  using (exists (select 1 from public.wiki_pages p where p.id = page_id));

create policy wiki_versions_insert on public.wiki_versions
  for insert to authenticated
  with check (
    exists (select 1 from public.wiki_pages p
             where p.id = page_id and public.app_has_permission(p.workspace_id, 'wiki.write'))
  );

-- ─────────────────────────── chat ───────────────────────────
-- Note there is no CLIENT path below: chat.read is simply not in that role's
-- permission set, so every policy here returns false for them.

create policy channels_select on public.channels
  for select to authenticated
  using (
    public.app_has_permission(workspace_id, 'chat.read')
    and (project_id is null or public.app_can_see_project(project_id))
    and (not is_private or public.app_is_channel_member(id))
  );

create policy channels_insert on public.channels
  for insert to authenticated
  with check (public.app_has_permission(workspace_id, 'chat.write'));

create policy channels_update on public.channels
  for update to authenticated
  using (public.app_is_at_least(workspace_id, 'PM') or public.app_is_channel_member(id))
  with check (public.app_is_at_least(workspace_id, 'PM') or public.app_is_channel_member(id));

create policy channel_members_select on public.channel_members
  for select to authenticated
  using (exists (select 1 from public.channels c where c.id = channel_id));

-- Joining a public channel is self-service; adding other people is not.
create policy channel_members_join on public.channel_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.channels c
       where c.id = channel_id
         and public.app_has_permission(c.workspace_id, 'chat.read')
         and (user_id = (select auth.uid()) or public.app_is_at_least(c.workspace_id, 'PM'))
    )
  );

-- Read receipts: everyone updates their own row.
create policy channel_members_update_self on public.channel_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy channel_members_leave on public.channel_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.channels c
                where c.id = channel_id and public.app_is_at_least(c.workspace_id, 'PM'))
  );

create policy messages_select on public.messages
  for select to authenticated
  using (
    public.app_has_permission(workspace_id, 'chat.read')
    and exists (select 1 from public.channels c where c.id = channel_id)
  );

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.app_has_permission(workspace_id, 'chat.write')
    and exists (select 1 from public.channels c where c.id = channel_id)
  );

-- Editing and deleting stay with the author; a PM can remove but not rewrite.
create policy messages_update_own on public.messages
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy messages_delete on public.messages
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.app_is_at_least(workspace_id, 'PM'));

create policy message_reactions_select on public.message_reactions
  for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

create policy message_reactions_write on public.message_reactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.messages m where m.id = message_id)
  );

-- ─────────────────────────── meetings and calendar ───────────────────────────

create policy meetings_select on public.meetings
  for select to authenticated
  using (
    public.app_is_member(workspace_id)
    and (project_id is null or public.app_can_see_project(project_id))
  );

create policy meetings_write on public.meetings
  for all to authenticated
  using (created_by_id = (select auth.uid()) or public.app_has_permission(workspace_id, 'meeting.manage'))
  with check (public.app_has_permission(workspace_id, 'meeting.manage'));

create policy meeting_participants_select on public.meeting_participants
  for select to authenticated
  using (exists (select 1 from public.meetings m where m.id = meeting_id));

-- You answer your own invitation; organisers manage the guest list.
create policy meeting_participants_respond on public.meeting_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy meeting_participants_manage on public.meeting_participants
  for all to authenticated
  using (
    exists (select 1 from public.meetings m
             where m.id = meeting_id and public.app_has_permission(m.workspace_id, 'meeting.manage'))
  )
  with check (
    exists (select 1 from public.meetings m
             where m.id = meeting_id and public.app_has_permission(m.workspace_id, 'meeting.manage'))
  );

create policy holidays_select on public.holidays
  for select to authenticated using (public.app_is_member(workspace_id));

create policy holidays_manage on public.holidays
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'workspace.manage'))
  with check (public.app_has_permission(workspace_id, 'workspace.manage'));

-- ─────────────────────────── time ───────────────────────────
-- Your own entries are yours; seeing everyone's is a reporting permission.

create policy time_logs_select on public.time_logs
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.app_has_permission(workspace_id, 'analytics.read')
  );

create policy time_logs_write_own on public.time_logs
  for all to authenticated
  using (user_id = (select auth.uid()) and public.app_has_permission(workspace_id, 'time.log'))
  with check (user_id = (select auth.uid()) and public.app_has_permission(workspace_id, 'time.log'));

-- ─────────────────────────── intelligence ───────────────────────────

-- The `secret` column is deliberately not exposed: revoke it at the column
-- level, because RLS filters rows and cannot hide a field.
revoke select (secret) on public.integrations from authenticated, anon;

create policy integrations_select on public.integrations
  for select to authenticated
  using (public.app_has_permission(workspace_id, 'workspace.manage'));

create policy integrations_manage on public.integrations
  for all to authenticated
  using (public.app_has_permission(workspace_id, 'workspace.manage'))
  with check (public.app_has_permission(workspace_id, 'workspace.manage'));

create policy ai_suggestions_select on public.ai_suggestions
  for select to authenticated
  using (
    public.app_is_member(workspace_id)
    and (project_id is null or public.app_can_see_project(project_id))
  );

-- Suggestions are produced by the engine under the service role. A client may
-- only ever decide one — and the decision has to be stamped with their own id.
create policy ai_suggestions_decide on public.ai_suggestions
  for update to authenticated
  using (public.app_has_permission(workspace_id, 'suggestion.decide'))
  with check (
    public.app_has_permission(workspace_id, 'suggestion.decide')
    and decided_by_id = (select auth.uid())
  );

create policy health_snapshots_select on public.health_snapshots
  for select to authenticated
  using (public.app_can_see_project(project_id));

create policy embeddings_select on public.embeddings
  for select to authenticated
  using (
    public.app_is_member(workspace_id)
    and (project_id is null or public.app_can_see_project(project_id))
    and (public.app_role(workspace_id) <> 'CLIENT' or visibility = 'SHARED')
  );
-- Ingestion runs under the service role; no client write policy.

create policy ask_logs_select on public.ask_logs
  for select to authenticated
  using (user_id = (select auth.uid()) or public.app_is_at_least(workspace_id, 'OWNER'));

create policy ask_logs_insert on public.ask_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.app_is_member(workspace_id));

-- ─────────────────────────── activity, audit, notifications ───────────────────────────

create policy notifications_select on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

create policy activity_log_select on public.activity_log
  for select to authenticated
  using (
    public.app_is_member(workspace_id)
    and (project_id is null or public.app_can_see_project(project_id))
  );

create policy activity_log_insert on public.activity_log
  for insert to authenticated
  with check (public.app_is_member(workspace_id) and actor_id = (select auth.uid()));

-- Append only, and only for people who could act on the workspace anyway.
-- There is no update or delete policy on purpose: an audit trail a user can
-- edit is not an audit trail.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    (workspace_id is not null and public.app_is_at_least(workspace_id, 'OWNER'))
    or public.app_is_platform_admin()
  );

-- ─────────────────────────── settings ───────────────────────────

create policy settings_select on public.settings
  for select to authenticated
  using (
    (workspace_id is not null and public.app_is_member(workspace_id))
    or (workspace_id is null and public.app_is_platform_admin())
  );

create policy settings_write on public.settings
  for all to authenticated
  using (workspace_id is not null and public.app_has_permission(workspace_id, 'workspace.manage'))
  with check (workspace_id is not null and public.app_has_permission(workspace_id, 'workspace.manage'));
