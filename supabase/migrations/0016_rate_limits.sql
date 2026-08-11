-- ============================================================================
-- 0016 · Rate limiting
-- ============================================================================
-- Counters live in Postgres rather than in process memory.
--
-- That is not the fastest option, it is the only correct one here: this app
-- runs as serverless functions, so an in-memory counter is per-instance and a
-- caller simply lands on a cold lambda to reset their own limit. A shared
-- store is the whole point, and Supabase is already the shared store — adding
-- Redis would mean a second service to provision, pay for and fail over.
--
-- The window is fixed rather than sliding. A fixed window can allow up to 2x
-- the limit across a boundary; for protecting an AI budget and slowing down
-- credential stuffing that is entirely adequate, and it costs one row and one
-- statement instead of a sorted set.
-- ============================================================================

create table public.rate_limits (
  bucket       text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

comment on table public.rate_limits is
  'Fixed-window request counters. Written only by app_rate_limit(); rows are disposable and safe to truncate.';

-- Old buckets are garbage the moment their window closes.
create index rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
-- No policies at all: nothing may read or write this table with a user session.
-- The function below is security definer and is the only door.
revoke all on public.rate_limits from anon, authenticated;

/**
 * Counts one request against a bucket and says whether it is allowed.
 *
 * Atomic by construction: the insert-or-update is a single statement, so two
 * concurrent requests cannot both read 4 and both write 5. The window resets
 * lazily — a bucket whose window has expired is overwritten rather than
 * scanned for and deleted, which keeps this to one round trip.
 */
create or replace function public.app_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_start timestamptz;
begin
  insert into public.rate_limits as r (bucket, count, window_start)
       values (p_bucket, 1, now())
  on conflict (bucket) do update
          set count = case
                        when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
                        else r.count + 1
                      end,
              window_start = case
                        when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
                        else r.window_start
                      end
    returning r.count, r.window_start into v_count, v_start;

  return query
    select v_count <= p_limit,
           greatest(0, p_limit - v_count),
           v_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke execute on function public.app_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.app_rate_limit(text, integer, integer) to authenticated, service_role;

/** Drops closed windows. Called by the nightly job; safe to run any time. */
create or replace function public.app_prune_rate_limits()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.app_prune_rate_limits() from public, anon, authenticated;
grant execute on function public.app_prune_rate_limits() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Check
-- ─────────────────────────────────────────────────────────────────────────────
--   select * from public.app_rate_limit('test', 3, 60);  -- allowed true,  remaining 2
--   select * from public.app_rate_limit('test', 3, 60);  -- allowed true,  remaining 1
--   select * from public.app_rate_limit('test', 3, 60);  -- allowed true,  remaining 0
--   select * from public.app_rate_limit('test', 3, 60);  -- allowed false, remaining 0
--   delete from public.rate_limits where bucket = 'test';
