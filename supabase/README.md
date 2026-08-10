# Supabase

The backend. Postgres, auth, storage, realtime and row level security, replacing
`apps/api` (Express + Prisma + Socket.io + Redis + Cloudinary).

Deployment shape: **web on Vercel, everything else on Supabase.** There is no
server of our own left to run.

## The queries, in order

Apply them lowest number first. Each depends on everything before it.

| # | File | What it does |
|---|------|--------------|
| 1 | `migrations/0001_extensions_and_enums.sql` | `pgcrypto`, `pg_trgm`, `pgvector`; the 10 enums |
| 2 | `migrations/0002_identity_and_rbac.sql` | `profiles` (keyed to `auth.users`), permissions / roles / role_permissions |
| 3 | `migrations/0003_tenancy.sql` | organisations, workspaces, departments, membership, invites |
| 4 | `migrations/0004_projects_and_tasks.sql` | projects, board columns, milestones, sprints, burndown, tasks, subtasks, dependencies, labels, comments |
| 5 | `migrations/0005_content_files_and_wiki.sql` | folders, attachments, wiki pages and versions |
| 6 | `migrations/0006_collaboration.sql` | channels, messages, reactions, meetings, holidays, time logs |
| 7 | `migrations/0007_intelligence_and_system.sql` | integrations, Auto-Pilot suggestions, health snapshots, embeddings, ask logs, activity, audit, settings, flags |
| 8 | `migrations/0008_functions_and_triggers.sql` | authorisation helpers, `handle_new_user`, `updated_at`, task numbering, `match_embeddings` |
| 9 | `migrations/0009_rls_core.sql` | RLS on every table; policies for identity, tenancy, projects, tasks |
| 10 | `migrations/0010_rls_content_and_comms.sql` | policies for files, wiki, chat, meetings, time, intelligence |
| 11 | `migrations/0011_realtime_and_storage.sql` | realtime publication, `attachments` and `avatars` buckets, storage policies |
| 12 | `migrations/0012_seed_reference_data.sql` | the permission matrix, four roles, plans, feature flags |

Result: **44 tables, 99 policies, RLS enabled on all of them.**

Number 12 is not demo content. Nothing can be authorised without it, because
every write policy resolves through `role_permissions`.

## Applying them

```bash
# local
supabase start
supabase db reset          # runs 0001..0012 in order

# hosted
supabase link --project-ref <ref>
supabase db push
```

Or paste each file into the SQL editor, lowest number first.

## Checking it

```bash
npm i pg                       # standalone, not a project dependency
node supabase/tests/rls.test.cjs
```

Builds a workspace with an OWNER, a MEMBER and a CLIENT and asserts who can
read what. The client boundary is the reason this test exists: the product
promises a client account cannot reach internal chat or unshared docs, and that
promise is now nothing but a policy.

Passing means, among other things: a CLIENT sees only projects they were added
to, only `is_shared` wiki pages, and zero messages; a MEMBER cannot promote
themselves or delete a project.

## How authorisation works

`apps/api/src/middleware/auth.ts` checked a permission once and then trusted
every query behind it. Here the rule travels with the data — a missed check
cannot leak, because there is no query path that skips a policy.

- **read** → membership of the row's workspace
- **write** → a named permission, resolved through the role matrix
- **CLIENT** → additionally narrowed to projects they belong to
- **service_role** → bypasses all of it; only for jobs and webhooks, never in the browser

The helpers in 0008 (`app_is_member`, `app_has_permission`, `app_can_see_project`, …)
are `SECURITY DEFINER` so a policy on `workspace_members` does not recurse into
itself, `STABLE` so the planner calls them once per statement rather than once
per row, and pinned to an empty `search_path` so they cannot be hijacked.

## Deliberate changes from the Prisma schema

| Was | Now | Why |
|-----|-----|-----|
| `users.password_hash`, `sessions`, `verification_tokens`, `two_factor_*`, `google_id` | `auth.users`, `auth.identities`, `auth.mfa_factors` | Supabase Auth owns credentials; refresh rotation and reuse detection come with it |
| `cuid()` text ids | `uuid` | native, indexable, what `auth.uid()` returns |
| camelCase columns | snake_case | what PostgREST and `supabase gen types` expect |
| `attachments.url` + Cloudinary | `attachments.storage_path` + private bucket | access goes through a signed URL under the same membership rule as the row |
| Socket.io rooms | realtime publication | broadcasts are filtered by the same RLS as reads |
| Redis rate limiting | Supabase / Vercel edge limits | no server of ours to hold the counter |

Enum **values** stay SCREAMING_CASE (`OWNER`, `URGENT`, `ACTIVE`) on purpose —
the web app already keys `ROLE_LABELS`, `PRIORITY_STYLE` and `STATUS_STYLE` off
those exact strings.

Two behaviours the old API enforced with a read-then-write, now constraints the
database keeps: one running timer per person (`time_logs_one_running_per_user`),
and per-project task numbering (advisory lock in `assign_task_number`, so two
simultaneous creates cannot both claim PAY-7).

## How the web app reaches it

`apps/web` is the only deployable. It talks to Supabase two ways:

- **Directly from the browser** for auth (`supabase.auth.*`) and realtime
  subscriptions. Both are RLS-filtered, so the anon key is safe there.
- **Through its own route handlers** in `apps/web/src/app/api/**` for data.
  These use the caller's session cookie, never the service role, so every query
  is still filtered by the policies in 0009 and 0010.

The service role is used in exactly two places, both of which have no session to
act on behalf of yet:

| Where | Why |
|-------|-----|
| `POST /api/workspaces` | The first OWNER row cannot be inserted by someone who is not yet a member |
| `POST /api/invites/[token]/accept` | Same problem, from the other side — plus the invite token is the authorisation |

`apps/web/src/lib/supabase/admin.ts` imports `server-only`, so reaching for it
from a client component is a build error rather than a leak.

## Permission vocabulary

The seeded `permissions` table and the RLS policies use coarser keys
(`workspace.manage`, `task.update`) than `packages/shared`
(`workspace.audit.view`, `task.update.own`). The policy SQL hard-codes the
database spelling, so that is the one that cannot move;
`apps/web/src/lib/server/permissions.ts` translates on the way in. Change one
and you must change the other.

## Known fixes waiting to be applied

`migrations/0013_fix_project_visibility_and_pm_grants.sql` corrects two real
defects found by driving the API against this database:

1. `app_can_see_project` is `STABLE` and re-reads `public.projects`, so it
   cannot see a row being inserted. Postgres requires the SELECT policy to pass
   whenever an INSERT carries a RETURNING clause, which meant **no client could
   create a project at all** — it failed as "new row violates row-level security
   policy". The route handler works around it by inserting and reading back in
   two statements; 0013 fixes the cause.
2. 0012 granted PM all 21 permissions, identical to OWNER, so a project manager
   could rename or delete the workspace, change roles and delete projects. 0013
   withdraws those three and gives CLIENT the two read permissions the client
   portal needs.

Until 0013 is applied the app runs, but PM is over-privileged relative to what
every screen implies.
