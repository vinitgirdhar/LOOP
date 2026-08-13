-- ============================================================================
-- 0018 · Subscriptions
-- ============================================================================
-- Checkout previously ended at a confirmation screen and wrote nothing, so a
-- payment left no trace: a signed-in person could pay and still see no plan
-- anywhere in the product. A subscription is the record that makes the purchase
-- real to the rest of the app — it is what the profile reads to say which plan
-- is active, and what the receipt list is drawn from.
--
-- Scope note, stated plainly: this project has no live Razorpay merchant
-- account, so the checkout runs in test mode and settles locally. The row is
-- therefore marked `is_test` and the receipt says so. Storing a simulated
-- payment as if it were a captured one is the dishonest option; this is not it.
-- ============================================================================

create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  workspace_id       uuid references public.workspaces (id) on delete set null,
  plan_id            uuid references public.billing_plans (id) on delete set null,
  -- Denormalised so a receipt still reads correctly if a plan is renamed or
  -- repriced later. An invoice must not change after it was issued.
  plan_key           text not null,
  plan_name          text not null,
  amount_inr         integer not null check (amount_inr >= 0),
  cadence            text not null check (cadence in ('monthly', 'annual')),
  payment_id         text not null,
  method             text,
  status             text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED', 'EXPIRED')),
  is_test            boolean not null default true,
  started_at         timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists subscriptions_user_active_idx
  on public.subscriptions (user_id, status, created_at desc);

comment on table public.subscriptions is
  'One row per completed checkout. The newest ACTIVE row is the plan the profile shows.';
comment on column public.subscriptions.is_test is
  'True when settled by the test-mode checkout rather than a live Razorpay capture.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.subscriptions enable row level security;

-- A person reads their own subscriptions, and nobody else's. Platform admins
-- can read all of them for the billing view in the admin panel.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.app_is_platform_admin());

-- Inserts are stamped with the caller's own id, so a session cannot buy a plan
-- on somebody else's behalf. Amount and plan are still validated server-side in
-- the route handler; this is the second line, not the only one.
drop policy if exists subscriptions_insert_own on public.subscriptions;
create policy subscriptions_insert_own on public.subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Cancelling is the only update a person may make to their own row.
drop policy if exists subscriptions_update_own on public.subscriptions;
create policy subscriptions_update_own on public.subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Check
-- ─────────────────────────────────────────────────────────────────────────────
--   select count(*) from public.subscriptions;   -- expect 0 on a fresh install
--   select policyname from pg_policies where tablename = 'subscriptions';
--   -- expect subscriptions_select_own, subscriptions_insert_own, subscriptions_update_own
