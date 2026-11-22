-- A log of the match imports: one row per run, good or bad, so "which days did the import run?" has an answer and a
-- fallback machine can ask "did one run well today?" before it repeats the work. A failed row says where (scrape,
-- dry_run, write) and why, which also shows how long the league's login lasts between "logged out" failures.
-- Service role only: no policies, and the functions are not executable by the API roles.

create table ingest_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  machine text not null,
  status text not null constraint ingest_runs_status_check check (status in ('ok', 'failed')),
  step text,
  error text,
  matches_seen int,
  matches_finished int,
  results_written int,
  players_skipped int,
  constraint ingest_runs_failed_says_why check (status = 'ok' or (step is not null and error is not null))
);
alter table ingest_runs enable row level security;
create index ingest_runs_ran_at on ingest_runs (ran_at desc);

create function record_ingest_run(p_run jsonb, p_now timestamptz default now()) returns bigint
language sql security definer set search_path = public as $$
  insert into ingest_runs (ran_at, machine, status, step, error, matches_seen, matches_finished, results_written, players_skipped)
  values (
    p_now,
    p_run->>'machine',
    p_run->>'status',
    p_run->>'step',
    left(p_run->>'error', 500),
    (p_run->>'matches_seen')::int,
    (p_run->>'matches_finished')::int,
    (p_run->>'results_written')::int,
    (p_run->>'players_skipped')::int
  )
  returning id;
$$;

-- Days are Madrid days, the league's own calendar.
create function ingest_ran_today(p_now timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ingest_runs
    where status = 'ok'
      and (ran_at at time zone 'Europe/Madrid')::date = (p_now at time zone 'Europe/Madrid')::date
  );
$$;

revoke all on table ingest_runs from public, anon, authenticated;
revoke execute on function record_ingest_run(jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function ingest_ran_today(timestamptz) from public, anon, authenticated;
