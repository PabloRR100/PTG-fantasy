-- Tablón (the league's public feed) and the notification inbox.
--
-- activity: one row for each operation that moves a player between a team and the market: a signing at the 06:00
-- close ('signed', the winning bid) and a sale to the market ('sold', the player's value). It holds what the
-- squads and profiles tables already show every signed-in user (who owns whom) plus the price, and is written only
-- by close_cycle and sell_player. Trades between teams and release-clause buyouts do not exist in the rules yet, so
-- they have no kind; adding them means a new kind here and the function that performs them writing the row.
-- Depends on 0006 (close_cycle) and 0009.

create table activity (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('signed', 'sold')),
  user_id uuid not null references profiles (user_id) on delete cascade,
  player_id uuid not null references players (id),
  amount int not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index activity_recent on activity (id desc);
alter table activity enable row level security;
create policy activity_read on activity for select to authenticated using (true);

-- 0006's close_cycle, plus the 'signed' row when a bid wins.
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
    where not exists (select 1 from squads s where s.player_id = p.id)
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
revoke execute on function close_cycle(boolean, timestamptz) from public, anon, authenticated;

-- 0002's sell_player, plus the 'sold' row.
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

  select color, value into v_color, v_value from players where id = p_player;
  -- Fewer than 2 of a color would make a valid lineup impossible.
  if (select count(*) from squads s join players p on p.id = s.player_id
      where s.user_id = v_user and p.color = v_color) <= 2 then
    raise exception 'you need at least 2 players of each color';
  end if;

  v_was_starter := exists (select 1 from lineups where user_id = v_user and player_id = p_player);
  delete from squads where player_id = p_player and user_id = v_user; -- lineups row cascades
  update profiles set budget = budget + v_value where user_id = v_user;
  insert into activity (kind, user_id, player_id, amount) values ('sold', v_user, p_player, v_value);

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
revoke execute on function sell_player(uuid) from public, anon, authenticated;
grant execute on function sell_player(uuid) to authenticated;

-- Inbox: each manager reads their own rows of the push outbox (bid won, bid lost, market open). Rows carry facts, the
-- wording lives in src/services/notifications.ts. read_at is set by mark_notifications_read for the caller only.
alter table notification_outbox add column read_at timestamptz;
create index notification_outbox_inbox on notification_outbox (user_id, id desc);
create policy notification_outbox_own_read on notification_outbox for select to authenticated using (user_id = auth.uid());

create function mark_notifications_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update notification_outbox set read_at = now() where user_id = auth.uid() and read_at is null;
end;
$$;
revoke execute on function mark_notifications_read() from public, anon, authenticated;
grant execute on function mark_notifications_read() to authenticated;
