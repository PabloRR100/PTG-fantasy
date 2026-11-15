-- Market fixes found when the first real round closed with every listing expired.
--
-- 1. A player on an open listing could be drawn into a new team's starting squad (create_manager), and bids on him
--    were then accepted and silently lost at the close (a real bid on MARIO expired this way). Now create_manager
--    skips players with an open listing, and place_bid refuses a player who already has a team.
-- 2. open_market_listings(): tops the open market up to market_listings_per_color() free players of EVERY color, closing
--    at the cycle boundary. close_cycle does this each night; this is the same rule on demand, for the moment colors
--    are added in the middle of a day. Returns how many listings it opened. Safe to repeat.

-- 0009's create_manager, skipping players on an open listing.
create or replace function create_manager(p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_colors int := (select count(*) from game_colors);
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
    select p.id, row_number() over (partition by p.color order by random()) as rn
    from players p
    where not exists (select 1 from squads s where s.player_id = p.id)
      and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
  ) free
  where rn <= 3;

  if (select count(*) from squads where user_id = v_user) <> 3 * v_colors then
    raise exception 'not enough free players to build a squad (need 3 free players in each of % colors)', v_colors;
  end if;

  insert into lineups (user_id, player_id)
  select v_user, id
  from (
    select p.id, row_number() over (partition by p.color order by p.value desc) as rn
    from squads s join players p on p.id = s.player_id
    where s.user_id = v_user
  ) mine
  where rn <= 2;
end;
$$;

-- 0002's place_bid, refusing a player who already has a team.
create or replace function place_bid(p_listing uuid, p_amount int) returns void
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

  -- A listed player can still end up on a squad before the close (a new team's draw, an admin); his listing is dead.
  if exists (select 1 from squads where player_id = v_listing.player_id) then
    raise exception 'player already has a team';
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

create function open_market_listings() returns int
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
    where not exists (select 1 from squads s where s.player_id = p.id)
      and not exists (select 1 from market_listings m where m.player_id = p.id and m.status = 'open')
  ) free
  where rn + already <= market_listings_per_color();
  get diagnostics v_opened = row_count;
  return v_opened;
end;
$$;

revoke execute on function create_manager(text), place_bid(uuid, int), open_market_listings() from public, anon, authenticated;
grant execute on function create_manager(text), place_bid(uuid, int) to authenticated;
