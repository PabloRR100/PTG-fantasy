-- Market size grows with the league: each daily renewal lists max(3, registered teams) free players per
-- color, as many as are free. Replaces the fixed 3 of 0002_market.sql. Only the listings opened by the NEXT
-- close_cycle change: this migration touches no row, so a round that is already open is left as it is.

-- Teams are profiles (a signed-up user with no team yet does not count). Internal: not exposed to the API roles.
create function market_listings_per_color() returns int
language sql stable as $$
  select greatest(3, count(*))::int from profiles
$$;

-- Closes a cycle: resolves every open listing, snapshots lineups, opens tomorrow's listings (size: see
-- market_listings_per_color above).
-- Without p_force it acts only when it is 06:00 Madrid and the cycle has not been closed yet, so
-- a schedule that fires at both 04:00 and 05:00 UTC (DST-proof) acts exactly once a day.
-- p_now exists so tests can pin the clock. Returns the cycle date, or null when it did nothing.
create or replace function close_cycle(p_force boolean default false, p_now timestamptz default now())
returns date
language plpgsql security definer set search_path = public as $$
declare
  v_madrid timestamp := p_now at time zone 'Europe/Madrid';
  v_cycle date := cycle_date_of(p_now);
  v_next_close timestamptz := ((v_cycle + 1)::timestamp + interval '6 hours') at time zone 'Europe/Madrid';
  v_rows int;
  v_listing record;
  v_bid record;
  v_budget int;
  v_won boolean;
begin
  if not p_force and extract(hour from v_madrid) <> 6 then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('ptg.close_cycle'));

  if p_force then
    insert into cycles (cycle_date, closed_at) values (v_cycle, p_now)
    on conflict (cycle_date) do update set closed_at = excluded.closed_at;
  else
    insert into cycles (cycle_date, closed_at) values (v_cycle, p_now) on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return null;
    end if;
  end if;

  -- Every open listing ends at the cycle boundary, whatever its closes_at says to the millisecond.
  for v_listing in
    select id, player_id from market_listings where status = 'open' order by id for update
  loop
    v_won := false;
    for v_bid in
      select user_id, amount from bids where listing_id = v_listing.id
      order by amount desc, seq asc
    loop
      select budget into v_budget from profiles where user_id = v_bid.user_id for update;
      if v_budget >= v_bid.amount
         and not exists (select 1 from squads where player_id = v_listing.player_id) then
        update profiles set budget = budget - v_bid.amount where user_id = v_bid.user_id;
        insert into squads (player_id, user_id) values (v_listing.player_id, v_bid.user_id);
        v_won := true;
        exit;
      end if;
    end loop;
    update market_listings set status = case when v_won then 'sold' else 'expired' end
    where id = v_listing.id;
  end loop;

  delete from lineup_snapshots where cycle_date = v_cycle;
  insert into lineup_snapshots (cycle_date, user_id, player_id)
  select v_cycle, user_id, player_id from lineups;

  -- Tomorrow's market: market_listings_per_color() random free players per color (fewer if not that many are free).
  insert into market_listings (player_id, closes_at)
  select id, v_next_close
  from (
    select p.id, row_number() over (partition by p.color order by random()) as rn
    from players p
    where not exists (select 1 from squads s where s.player_id = p.id)
      and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
  ) free
  where rn <= market_listings_per_color();

  return v_cycle;
end;
$$;

-- CREATE OR REPLACE keeps the existing grants; stated again so this file is correct on its own (see 0001: the API
-- roles hold EXECUTE by default and close_cycle is for pg_cron and admin_close_market only).
revoke execute on function market_listings_per_color(), close_cycle(boolean, timestamptz) from public, anon, authenticated;
