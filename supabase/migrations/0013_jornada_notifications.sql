-- Tells every manager how the jornada (a Monday-to-Sunday week) ended: their points, their place that week and in the
-- table. It runs from the match import, never from close_cycle: at 06:00 on Monday the weekend's matches are not in
-- yet, so announcing then would report wrong points. announce_closed_jornadas() is idempotent and announces a week once.

alter table notification_prefs add column jornada boolean not null default true;

alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('bid_won', 'bid_lost', 'market_open', 'jornada_closed'));

create table jornada_announcements (
  week_start date primary key,
  announced_at timestamptz not null default now()
);
alter table jornada_announcements enable row level security;
create policy jornada_announcements_read on jornada_announcements for select to authenticated using (true);

create function announce_closed_jornadas(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_current date := date_trunc('week', cycle_date_of(p_now)::timestamp)::date;
  v_week date;
  v_latest date;
  v_prior date;
  v_sent int := 0;
begin
  -- The newest closed week with points that was not announced yet gets the notifications; older unannounced
  -- weeks are only marked, so switching this on never floods anyone with history.
  select max(w) into v_latest from (
    select date_trunc('week', cycle_date::timestamp)::date w from manager_cycle_points group by 1
  ) weeks
  where w < v_current and not exists (select 1 from jornada_announcements a where a.week_start = w);
  if v_latest is null then
    return 0;
  end if;

  insert into jornada_announcements (week_start)
  select w from (select date_trunc('week', cycle_date::timestamp)::date w from manager_cycle_points group by 1) weeks
  where w < v_latest and not exists (select 1 from jornada_announcements a where a.week_start = w);

  select max(w) into v_prior from (
    select date_trunc('week', cycle_date::timestamp)::date w from manager_cycle_points group by 1
  ) weeks where w < v_latest;

  insert into notification_outbox (user_id, kind, data)
  with weekly as (
    select p.user_id, p.team_name, coalesce(sum(m.points), 0)::int as points
    from profiles p
    left join manager_cycle_points m on m.user_id = p.user_id and date_trunc('week', m.cycle_date::timestamp)::date = v_latest
    group by p.user_id, p.team_name
  ),
  totals as (
    select p.user_id,
      coalesce(sum(m.points) filter (where date_trunc('week', m.cycle_date::timestamp)::date <= v_latest), 0)::int as upto,
      coalesce(sum(m.points) filter (where v_prior is not null and date_trunc('week', m.cycle_date::timestamp)::date <= v_prior), 0)::int as before
    from profiles p left join manager_cycle_points m on m.user_id = p.user_id
    group by p.user_id
  ),
  ranked as (
    select w.user_id, w.team_name, w.points,
      rank() over (order by w.points desc) as week_rank,
      rank() over (order by t.upto desc) as overall_rank,
      rank() over (order by t.before desc) as prior_rank,
      count(*) over () as teams
    from weekly w join totals t using (user_id)
  )
  select r.user_id, 'jornada_closed', jsonb_build_object(
    'week_start', v_latest, 'points', r.points, 'rank', r.week_rank, 'teams', r.teams,
    'overall_rank', r.overall_rank, 'delta', case when v_prior is null then 0 else r.prior_rank - r.overall_rank end,
    'winner', (select team_name from ranked order by points desc, team_name limit 1),
    'winner_points', (select max(points) from ranked))
  from ranked r;
  get diagnostics v_sent = row_count;

  insert into jornada_announcements (week_start) values (v_latest);
  return v_sent;
end;
$$;

-- Only the service role (the match import) calls it.
revoke execute on function announce_closed_jornadas(timestamptz) from public, anon, authenticated;
