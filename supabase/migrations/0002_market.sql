-- Market: bids, selling, and the 06:00 Madrid close. Rules: docs/GAMEPLAY.md sections 3 and 6.
-- Every money or ownership change is one transaction inside these functions; there are no
-- table write policies (see 0001_core.sql).

create function place_bid(p_listing uuid, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_listing market_listings;
  v_value int;
  v_budget int;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select * into v_listing from market_listings where id = p_listing;
  if not found or v_listing.status <> 'open' or v_listing.closes_at <= now() then
    raise exception 'listing is not open';
  end if;

  select budget into v_budget from profiles where user_id = v_user;
  if not found then
    raise exception 'create your team first';
  end if;

  select value into v_value from players where id = v_listing.player_id;
  if p_amount < v_value then
    raise exception 'bid is below the market value (minimum %)', v_value;
  end if;
  if p_amount > v_budget then
    raise exception 'bid is above your budget (%)', v_budget;
  end if;

  insert into bids (listing_id, user_id, amount) values (p_listing, v_user, p_amount);
end;
$$;

-- Sells one of the caller's players to the market at once, for its current value.
create function sell_player(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_color text;
  v_value int;
  v_was_starter boolean;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from squads where player_id = p_player and user_id = v_user) then
    raise exception 'player is not in your squad';
  end if;

  select color, value into v_color, v_value from players where id = p_player;
  -- Fewer than 2 of a color would make a valid lineup impossible.
  if (select count(*) from squads s join players p on p.id = s.player_id
      where s.user_id = v_user and p.color = v_color) <= 2 then
    raise exception 'you need at least 2 players of each color';
  end if;

  v_was_starter := exists (select 1 from lineups where user_id = v_user and player_id = p_player);
  delete from squads where player_id = p_player and user_id = v_user; -- lineups row cascades
  update profiles set budget = budget + v_value where user_id = v_user;

  if v_was_starter then
    insert into lineups (user_id, player_id)
    select v_user, s.player_id
    from squads s join players p on p.id = s.player_id
    where s.user_id = v_user and p.color = v_color
      and s.player_id not in (select player_id from lineups where user_id = v_user)
    order by p.value desc
    limit 1;
  end if;
end;
$$;

-- Closes a cycle: resolves every open listing, snapshots lineups, opens tomorrow's listings.
-- Without p_force it acts only when it is 06:00 Madrid and the cycle has not been closed yet, so
-- a schedule that fires at both 04:00 and 05:00 UTC (DST-proof) acts exactly once a day.
-- p_now exists so tests can pin the clock. Returns the cycle date, or null when it did nothing.
create function close_cycle(p_force boolean default false, p_now timestamptz default now())
returns date
language plpgsql security definer set search_path = public as $$
declare
  v_madrid timestamp := p_now at time zone 'Europe/Madrid';
  v_cycle date := (v_madrid - interval '6 hours')::date; -- same rule as src/services/cycles.ts
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

  -- Tomorrow's market: 3 random free players per color.
  insert into market_listings (player_id, closes_at)
  select id, v_next_close
  from (
    select p.id, row_number() over (partition by p.color order by random()) as rn
    from players p
    where not exists (select 1 from squads s where s.player_id = p.id)
      and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
  ) free
  where rn <= 3;

  return v_cycle;
end;
$$;

-- The demo's "close the market now" button.
create function admin_close_market() returns date
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where user_id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
  return close_cycle(true, now());
end;
$$;

-- See 0001: the API roles hold EXECUTE by default. close_cycle is for pg_cron and admin_close_market only.
revoke execute on function place_bid(uuid, int), sell_player(uuid), admin_close_market(),
  close_cycle(boolean, timestamptz) from public, anon, authenticated;
grant execute on function place_bid(uuid, int), sell_player(uuid), admin_close_market() to authenticated;

do $$
begin
  -- Madrid is UTC+1 or UTC+2, so 06:00 there is 04:00 or 05:00 UTC. Both fire; close_cycle only
  -- acts at 06:00 Madrid, once. Skipped where pg_cron is unavailable (tests); Task 11 checks cron.job.
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ptg-close-cycle-0400-utc', '0 4 * * *', 'select close_cycle()');
    perform cron.schedule('ptg-close-cycle-0500-utc', '0 5 * * *', 'select close_cycle()');
  end if;
end $$;
