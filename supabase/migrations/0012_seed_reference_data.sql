-- ============================================================================
-- 0012 · Reference data
-- ============================================================================
-- The permission matrix, the four roles and the billing plans. This is not
-- demo content — the app cannot authorise anything without it, because every
-- write policy resolves through role_permissions. It is written idempotently
-- so re-running a migration set never duplicates a row.
-- ============================================================================

insert into public.permissions (key, description) values
  ('workspace.manage',   'Rename the workspace, manage integrations, holidays and settings'),
  ('member.manage',      'Invite, remove and change the role of members'),
  ('project.create',     'Create projects'),
  ('project.update',     'Edit projects, boards, members and milestones'),
  ('project.delete',     'Delete or archive projects'),
  ('task.create',        'Create tasks'),
  ('task.update',        'Edit, move and assign tasks'),
  ('task.delete',        'Delete tasks'),
  ('comment.create',     'Comment on tasks'),
  ('sprint.manage',      'Plan, start and close sprints'),
  ('wiki.read',          'Read internal wiki pages'),
  ('wiki.write',         'Create and edit wiki pages'),
  ('chat.read',          'Read channels and messages'),
  ('chat.write',         'Post messages and create channels'),
  ('file.read',          'Download files'),
  ('file.upload',        'Upload files'),
  ('file.delete',        'Delete anyone''s files'),
  ('time.log',           'Track time'),
  ('meeting.manage',     'Create and edit meetings'),
  ('analytics.read',     'See workspace analytics and everyone''s time'),
  ('suggestion.decide',  'Accept or reject Auto-Pilot suggestions')
on conflict (key) do update set description = excluded.description;

insert into public.roles (key, name, description, rank) values
  ('OWNER',  'Owner',  'Full control of the workspace, including billing and deletion', 40),
  ('PM',     'Manager','Runs projects, sprints and people; cannot delete the workspace', 30),
  ('MEMBER', 'Member', 'Does the work: tasks, docs, chat, files and time',                20),
  ('CLIENT', 'Client', 'Read-only visitor: progress and shared docs, no internal chat',   10)
on conflict (key) do update
  set name = excluded.name, description = excluded.description, rank = excluded.rank;

-- ─────────────────────────── the matrix ───────────────────────────

-- OWNER holds everything.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
 where r.key = 'OWNER'
on conflict do nothing;

-- PM: everything except deleting the workspace itself, which is not a
-- permission — it is gated on rank in the workspaces_delete policy.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on true
 where r.key = 'PM'
   and p.key in (
     'workspace.manage', 'member.manage',
     'project.create', 'project.update', 'project.delete',
     'task.create', 'task.update', 'task.delete', 'comment.create',
     'sprint.manage', 'wiki.read', 'wiki.write', 'chat.read', 'chat.write',
     'file.read', 'file.upload', 'file.delete', 'time.log', 'meeting.manage',
     'analytics.read', 'suggestion.decide'
   )
on conflict do nothing;

-- MEMBER: does the work, manages nobody, sees only their own time.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on true
 where r.key = 'MEMBER'
   and p.key in (
     'task.create', 'task.update', 'comment.create',
     'wiki.read', 'wiki.write', 'chat.read', 'chat.write',
     'file.read', 'file.upload', 'time.log'
   )
on conflict do nothing;

-- CLIENT: note what is absent — chat.read, wiki.read and every write. Shared
-- wiki pages reach them through the is_shared branch of the wiki policy, not
-- through a permission, which is why they cannot read internal pages even by
-- guessing an id.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on true
 where r.key = 'CLIENT'
   and p.key in ('file.read', 'comment.create')
on conflict do nothing;

-- ─────────────────────────── plans and flags ───────────────────────────

insert into public.billing_plans (key, name, price_monthly, seats, features) values
  ('free',     'Free',     0,  5,   '["3 projects","Kanban, wiki and chat","Time tracking","Community support"]'::jsonb),
  ('team',     'Team',     12, 25,  '["Unlimited projects","Sprints and analytics","Auto-Pilot board","GitHub integration","Priority support"]'::jsonb),
  ('business', 'Business', 29, 999, '["Everything in Team","Ask the Workspace","Client portal access","Audit log export","SSO ready"]'::jsonb)
on conflict (key) do update
  set name = excluded.name,
      price_monthly = excluded.price_monthly,
      seats = excluded.seats,
      features = excluded.features;

insert into public.feature_flags (key, description, enabled, rollout) values
  ('autopilot.auto_apply', 'Allow rule-based suggestions above 0.9 confidence to apply themselves', true, 100),
  ('ask.workspace',        'Ask the Workspace retrieval and answers',                                true, 100),
  ('health.nightly',       'Nightly health snapshot job',                                            true, 100)
on conflict (key) do update set description = excluded.description;
