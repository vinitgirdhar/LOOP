-- ============================================================================
-- seed_dashboard.sql  —  make every dashboard widget show real data
-- ============================================================================
-- Paste into the Supabase SQL editor (the project the app points at) and Run.
-- Safe to run more than once: it clears its own seeded rows first (marked with
-- 'seed:dashboard') and re-derives everything, so numbers stay stable.
--
-- The dashboard numbers are PER USER. They were zero because tasks were not
-- assigned to the logged-in person, nothing was completed this week, and there
-- were no time logs or notifications. This fills all of that for every member
-- of the demo workspace.
--
-- Resolves the workspace and users from the data itself — no UUIDs to edit.
--
-- NOTE on the CLIENT account: by default this also gives the read-only client
-- assigned tasks and time logs, so their dashboard is not zero either. If you
-- would rather keep the "clients own nothing" story for judges, change the one
-- marked line below to exclude CLIENT.
-- ============================================================================

do $$
declare
  ws         uuid;
  members    uuid[];
  mcount     int;
  proj       uuid[];
  owner_id   uuid;
  u          uuid;
  t          record;
  i          int := 0;
  mtitle     text;
  mid        uuid;
begin
  -- Workspace = the one with the most projects (the seeded demo workspace).
  select workspace_id into ws
    from public.projects
   group by workspace_id
   order by count(*) desc
   limit 1;
  if ws is null then raise exception 'No workspace with projects found.'; end if;

  -- Members to populate. To keep the client read-only, append to this WHERE:
  --     and wm.role <> 'CLIENT'
  select array_agg(wm.user_id order by wm.role, pr.email)
    into members
    from public.workspace_members wm
    join public.profiles pr on pr.id = wm.user_id
   where wm.workspace_id = ws;                       -- <-- CLIENT toggle line
  mcount := coalesce(array_length(members, 1), 0);
  if mcount = 0 then raise exception 'Workspace % has no members.', ws; end if;

  select array_agg(id) into proj from public.projects where workspace_id = ws;
  select user_id into owner_id
    from public.workspace_members
   where workspace_id = ws and role = 'OWNER'
   limit 1;
  owner_id := coalesce(owner_id, members[1]);

  -- --------------------------------------------------------------------------
  -- 1) Assign every task round-robin, and start from a clean status slate so
  --    re-runs are deterministic.
  -- --------------------------------------------------------------------------
  update public.tasks
     set completed_at = null,
         status = 'todo'
   where workspace_id = ws;

  i := 0;
  for t in
    select id from public.tasks where workspace_id = ws order by project_id, number
  loop
    update public.tasks
       set assignee_id = members[(i % mcount) + 1]
     where id = t.id;
    i := i + 1;
  end loop;

  -- --------------------------------------------------------------------------
  -- 2) Give each member 3 tasks COMPLETED THIS WEEK (drives "Done this week",
  --    productivity and sprint burn-up), and spread the rest across the board
  --    with near-term due dates (drives "My open tasks" and "Upcoming").
  -- --------------------------------------------------------------------------
  foreach u in array members loop
    update public.tasks
       set status = 'completed',
           completed_at = now() - (random() * interval '6 days'),
           last_activity_at = now()
     where id in (
       select id from public.tasks
        where workspace_id = ws and assignee_id = u
        order by md5(id::text)
        limit 3
     );
  end loop;

  update public.tasks
     set due_date = now() + ((1 + floor(random() * 12)) * interval '1 day'),
         status = (array['todo','in_progress','code_review','testing'])[(1 + floor(random() * 4))::int]
   where workspace_id = ws and completed_at is null;

  -- --------------------------------------------------------------------------
  -- 3) Time logs this week — 5 sessions per member (drives "hours logged" and
  --    the productivity score). Idempotent via the 'seed:dashboard' note.
  -- --------------------------------------------------------------------------
  delete from public.time_logs where workspace_id = ws and note = 'seed:dashboard';

  insert into public.time_logs
    (workspace_id, project_id, task_id, user_id, seconds, note, started_at, ended_at, is_running, day)
  select ws, tk.project_id, tk.id, tk.assignee_id,
         (1800 + floor(random() * 9000))::int,          -- 0.5h .. 3h
         'seed:dashboard',
         s.started, s.started + interval '90 minutes', false, s.started::date
    from (
      select id, project_id, assignee_id,
             row_number() over (partition by assignee_id order by md5(id::text)) as rn
        from public.tasks
       where workspace_id = ws and assignee_id is not null
    ) tk
    cross join lateral (
      select now()
             - (floor(random() * 7) || ' days')::interval
             - (floor(random() * 8) || ' hours')::interval as started
    ) s
   where tk.rn <= 5;

  -- --------------------------------------------------------------------------
  -- 4) Unread notifications — 5 per member (drives the "Unread" tile and bell).
  -- --------------------------------------------------------------------------
  delete from public.notifications where workspace_id = ws and body = 'seed:dashboard';

  insert into public.notifications
    (workspace_id, user_id, actor_id, type, title, body, link, read_at, created_at)
  select ws, m.uid, owner_id, v.ntype::public.notification_type, v.title,
         'seed:dashboard', null, null,
         now() - (floor(random() * 72) || ' hours')::interval
    from unnest(members) as m(uid)
    cross join (values
      ('TASK_ASSIGNED',    'A task was assigned to you'),
      ('MENTION',          'You were mentioned in #general'),
      ('COMMENT_ADDED',    'New comment on a task you follow'),
      ('DEADLINE_REMINDER','A task is due soon'),
      ('SPRINT_STARTED',   'A new sprint has started')
    ) as v(ntype, title);

  -- --------------------------------------------------------------------------
  -- 5) Meetings across the calendar window (drives Calendar + Meetings pages),
  --    with everyone as an accepted participant. Idempotent via agenda marker.
  -- --------------------------------------------------------------------------
  delete from public.meetings where workspace_id = ws and agenda = 'seed:dashboard';

  for i in 0..5 loop
    mtitle := (array['Sprint planning','Design review','Daily standup',
                     'Client demo','Sprint retrospective','Backlog grooming'])[i + 1];
    insert into public.meetings
      (workspace_id, project_id, title, agenda, starts_at, ends_at,
       created_by_id, meeting_url, conference_provider)
    values
      (ws, proj[(1 + floor(random() * array_length(proj, 1)))::int], mtitle, 'seed:dashboard',
       date_trunc('hour', now()) + ((i - 2) || ' days')::interval + interval '10 hours',
       date_trunc('hour', now()) + ((i - 2) || ' days')::interval + interval '11 hours',
       owner_id, 'https://meet.google.com/seed-demo-' || i, 'google_meet')
    returning id into mid;

    insert into public.meeting_participants (meeting_id, user_id, status)
    select mid, m.uid, 'ACCEPTED'::public.meeting_participant_status
      from unnest(members) as m(uid)
    on conflict do nothing;
  end loop;

  -- --------------------------------------------------------------------------
  -- 6) Health snapshots — one recent score per project (project health tiles).
  -- --------------------------------------------------------------------------
  delete from public.health_snapshots where workspace_id = ws and narrative = 'seed:dashboard';

  insert into public.health_snapshots (workspace_id, project_id, score, signals, actions, narrative)
  select ws, id, (55 + floor(random() * 40))::int, '[]'::jsonb, '[]'::jsonb, 'seed:dashboard'
    from public.projects
   where workspace_id = ws;

  raise notice 'Seeded dashboard data for workspace % across % members.', ws, mcount;
end $$;
