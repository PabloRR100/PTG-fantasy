-- Azul and Blanco are one level for squads and lineups, and players who are not in this semester's rankings leave the game.
--
-- 1. game_colors.group_name: the level the squad and lineup rules count by. Blanco and Azul share one ('Azul y Blanco');
--    every other color is its own. Colors, values and filters are unchanged: a Blanco player is still Blanco. A squad
--    holds 3 players of each level and a lineup 2 starters of each level (9 levels: 27 and 18); selling needs 2 to
--    remain in the level. The daily market still lists max(3, teams) free players per COLOR.
-- 2. players.active: false for players absent from every current ranking. They stay (match history) but are out of
--    squads, lineups, drawing, the market and the catalog.
-- Depends on 0007 to 0011.

alter table game_colors add column group_name text;
update game_colors set group_name = case when name in ('Blanco', 'Azul') then 'Azul y Blanco' else name end;
alter table game_colors alter column group_name set not null;

alter table players add column active boolean not null default true;

-- 0011's create_manager, counting by level group and skipping inactive players.
create or replace function create_manager(p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_groups int := (select count(distinct group_name) from game_colors);
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from profiles where user_id = v_user) then
    raise exception 'user already has a team';
  end if;

  -- Two managers signing up at once must not pick the same free players.
  perform pg_advisory_xact_lock(hashtext('ptg.create_manager'));

  insert into profiles (user_id, team_name) values (v_user, btrim(p_team));

  insert into squads (player_id, user_id)
  select id, v_user
  from (
    select p.id, row_number() over (partition by gc.group_name order by random()) as rn
    from players p join game_colors gc on gc.name = p.color
    where p.active and not exists (select 1 from squads s where s.player_id = p.id)
      and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
  ) free
  where rn <= 3;

  if (select count(*) from squads where user_id = v_user) <> 3 * v_groups then
    raise exception 'not enough free players to build a squad (need 3 free players in each of % levels)', v_groups;
  end if;

  insert into lineups (user_id, player_id)
  select v_user, id
  from (
    select p.id, row_number() over (partition by gc.group_name order by p.value desc) as rn
    from squads s join players p on p.id = s.player_id join game_colors gc on gc.name = p.color
    where s.user_id = v_user
  ) mine
  where rn <= 2;
end;
$$;

-- 0009's set_lineup, counting by level group.
create or replace function set_lineup(p_players uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_foreign uuid;
  v_groups int := (select count(distinct group_name) from game_colors);
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select pid into v_foreign
  from unnest(p_players) as pid
  where pid not in (select player_id from squads where user_id = v_user)
  limit 1;
  if v_foreign is not null then
    raise exception 'player % is not in your squad', v_foreign;
  end if;

  if (select count(distinct pid) from unnest(p_players) as pid) <> 2 * v_groups
     or (select count(*) from (
           select gc.group_name from players p join game_colors gc on gc.name = p.color where p.id = any (p_players)
           group by gc.group_name having count(*) = 2
         ) ok) <> v_groups then
    raise exception 'lineup needs exactly 2 players per color (% in total)', 2 * v_groups;
  end if;

  delete from lineups where user_id = v_user;
  insert into lineups (user_id, player_id) select v_user, pid from unnest(p_players) as pid;
end;
$$;

-- 0009's repair_lineups, counting by level group.
create or replace function repair_lineups() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_keep uuid[];
  v_groups int := (select count(distinct group_name) from game_colors);
  v_repaired int := 0;
  v_impossible int := 0;
begin
  for v_user in
    select p.user_id from profiles p
    where not (
      (select count(*) from lineups l where l.user_id = p.user_id) = 2 * v_groups
      and (select count(*) from (
             select gc.group_name from lineups l join players pl on pl.id = l.player_id join game_colors gc on gc.name = pl.color
             where l.user_id = p.user_id group by gc.group_name having count(*) = 2
           ) ok) = v_groups
    )
  loop
    select array_agg(player_id) into v_keep
    from (
      select s.player_id,
             row_number() over (
               partition by gc.group_name
               order by (l.player_id is not null) desc, pl.value desc, pl.id
             ) as rn
      from squads s
      join players pl on pl.id = s.player_id
      join game_colors gc on gc.name = pl.color
      left join lineups l on l.user_id = s.user_id and l.player_id = s.player_id
      where s.user_id = v_user
    ) ranked
    where rn <= 2;

    if coalesce(array_length(v_keep, 1), 0) < 2 * v_groups then
      v_impossible := v_impossible + 1;
      continue;
    end if;

    delete from lineups where user_id = v_user and player_id <> all (v_keep);
    insert into lineups (user_id, player_id) select v_user, pid from unnest(v_keep) as pid on conflict do nothing;
    v_repaired := v_repaired + 1;
  end loop;
  return jsonb_build_object('repaired', v_repaired, 'impossible', v_impossible);
end;
$$;

-- 0010's sell_player, counting by level group.
create or replace function sell_player(p_player uuid) returns void
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

  select gc.group_name, p.value into v_color, v_value from players p join game_colors gc on gc.name = p.color where p.id = p_player;
  -- Fewer than 2 of a level would make a valid lineup impossible (v_color holds the level group).
  if (select count(*) from squads s join players p on p.id = s.player_id join game_colors gc on gc.name = p.color
      where s.user_id = v_user and gc.group_name = v_color) <= 2 then
    raise exception 'you need at least 2 players of each color';
  end if;

  v_was_starter := exists (select 1 from lineups where user_id = v_user and player_id = p_player);
  delete from squads where player_id = p_player and user_id = v_user; -- lineups row cascades
  update profiles set budget = budget + v_value where user_id = v_user;
  insert into activity (kind, user_id, player_id, amount) values ('sold', v_user, p_player, v_value);

  if v_was_starter then
    insert into lineups (user_id, player_id)
    select v_user, s.player_id
    from squads s join players p on p.id = s.player_id join game_colors gc on gc.name = p.color
    where s.user_id = v_user and gc.group_name = v_color
      and s.player_id not in (select player_id from lineups where user_id = v_user)
    order by p.value desc
    limit 1;
  end if;
end;
$$;

-- 0010's close_cycle, listing only active players.
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
  v_winner uuid;
  v_name text;
  v_opened int;
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
    v_winner := null;
    select display_name into v_name from players where id = v_listing.player_id;
    for v_bid in
      select user_id, amount from bids where listing_id = v_listing.id
      order by amount desc, seq asc
    loop
      select budget into v_budget from profiles where user_id = v_bid.user_id for update;
      if v_budget >= v_bid.amount
         and not exists (select 1 from squads where player_id = v_listing.player_id) then
        update profiles set budget = budget - v_bid.amount where user_id = v_bid.user_id;
        insert into squads (player_id, user_id) values (v_listing.player_id, v_bid.user_id);
        insert into activity (kind, user_id, player_id, amount) values ('signed', v_bid.user_id, v_listing.player_id, v_bid.amount);
        v_won := true;
        v_winner := v_bid.user_id;
        insert into notification_outbox (user_id, kind, data)
        values (v_bid.user_id, 'bid_won', jsonb_build_object('player', v_name, 'amount', v_bid.amount));
        exit;
      end if;
    end loop;
    -- Everyone else who bid on it, once each, however many bids they placed.
    insert into notification_outbox (user_id, kind, data)
    select distinct b.user_id, 'bid_lost', jsonb_build_object('player', v_name)
    from bids b
    where b.listing_id = v_listing.id and b.user_id is distinct from v_winner;
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
    where p.active and not exists (select 1 from squads s where s.player_id = p.id)
      and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
  ) free
  where rn <= market_listings_per_color();
  get diagnostics v_opened = row_count;

  if v_opened > 0 then
    insert into notification_outbox (user_id, kind, data)
    select user_id, 'market_open', jsonb_build_object('count', v_opened) from profiles;
  end if;

  return v_cycle;
end;
$$;

-- 0011's open_market_listings, listing only active players.
create or replace function open_market_listings() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_close timestamptz := coalesce(
    (select min(closes_at) from market_listings where status = 'open'),
    ((cycle_date_of(now()) + 1)::timestamp + interval '6 hours') at time zone 'Europe/Madrid');
  v_opened int;
begin
  perform pg_advisory_xact_lock(hashtext('ptg.close_cycle'));
  insert into market_listings (player_id, closes_at)
  select id, v_close
  from (
    select p.id,
           row_number() over (partition by p.color order by random()) as rn,
           (select count(*) from market_listings m join players mp on mp.id = m.player_id
            where m.status = 'open' and mp.color = p.color) as already
    from players p
    where p.active and not exists (select 1 from squads s where s.player_id = p.id)
      and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
  ) free
  where rn + already <= market_listings_per_color();
  get diagnostics v_opened = row_count;
  return v_opened;
end;
$$;

-- 0007's ingest_players: loading a player (re)activates him.
create or replace function ingest_players(p_players jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into players (ptg_player_id, display_name, color, group_id, gender, matches_played, ratio, value, active)
  select (e ->> 'ptg_player_id')::uuid, e ->> 'display_name', e ->> 'color', (e ->> 'group_id')::uuid,
         coalesce(e ->> 'gender', 'male'), (e ->> 'matches_played')::int, (e ->> 'ratio')::numeric, (e ->> 'value')::int, true
  from jsonb_array_elements(p_players) e
  on conflict (ptg_player_id) do update set
    display_name = excluded.display_name,
    color = excluded.color,
    group_id = excluded.group_id,
    gender = excluded.gender,
    matches_played = excluded.matches_played,
    ratio = excluded.ratio,
    active = true,
    updated_at = now();
  get diagnostics v_count = row_count;
  perform repair_lineups();
  return v_count;
end;
$$;

-- 0009's draw, by level group and active players only.
create or replace function draw_missing_players() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_group text;
  v_have int;
  v_added int;
  v_total int := 0;
  v_short int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('ptg.create_manager'));
  for v_user in select user_id from profiles order by created_at, user_id loop
    for v_group in select distinct group_name from game_colors order by 1 loop
      select count(*) into v_have
      from squads s join players p on p.id = s.player_id join game_colors gc on gc.name = p.color
      where s.user_id = v_user and gc.group_name = v_group;
      if v_have < 3 then
        insert into squads (player_id, user_id)
        select p.id, v_user
        from players p join game_colors gc on gc.name = p.color
        where gc.group_name = v_group and p.active
          and not exists (select 1 from squads s where s.player_id = p.id)
          and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
        order by random()
        limit 3 - v_have;
        get diagnostics v_added = row_count;
        v_total := v_total + v_added;
        if v_added < 3 - v_have then
          v_short := v_short + 1;
        end if;
      end if;
    end loop;
  end loop;
  perform repair_lineups();
  return jsonb_build_object('added', v_total, 'short', v_short);
end;
$$;

-- Players who are not in this semester's rankings are not part of the game: they leave squads, lineups and the market
-- and stay in the table, inactive, so their match history is kept. p_present is the list of PTG ids that appear in
-- ANY ranking page (the ambiguous ones included). Teams that lose players are topped up by the draw. Refuses a list
-- that is obviously not a full scrape, so an empty or partial run can never empty the game.
create function deactivate_absent_players(p_present uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gone uuid[];
  v_squads int;
  v_listings int;
  v_draw jsonb;
begin
  if coalesce(cardinality(p_present), 0) < 100 then
    raise exception 'refusing to deactivate players: only % ids given, that is not a full ranking scrape', coalesce(cardinality(p_present), 0);
  end if;
  select coalesce(array_agg(id), '{}') into v_gone from players where active and ptg_player_id <> all (p_present);

  update market_listings set status = 'expired' where status = 'open' and player_id = any (v_gone);
  get diagnostics v_listings = row_count;
  delete from squads where player_id = any (v_gone); -- lineups rows cascade
  get diagnostics v_squads = row_count;
  update players set active = false, updated_at = now() where id = any (v_gone);

  v_draw := draw_missing_players();
  return jsonb_build_object('deactivated', cardinality(v_gone), 'squad_places_freed', v_squads, 'listings_closed', v_listings, 'draw', v_draw);
end;
$$;

revoke execute on function create_manager(text), set_lineup(uuid[]), repair_lineups(), sell_player(uuid), close_cycle(boolean, timestamptz),
  open_market_listings(), ingest_players(jsonb), draw_missing_players(), deactivate_absent_players(uuid[]) from public, anon, authenticated;
grant execute on function create_manager(text), set_lineup(uuid[]), sell_player(uuid) to authenticated;
