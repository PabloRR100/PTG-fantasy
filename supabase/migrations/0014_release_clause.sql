-- Release clause: any manager can take a player from a rival's squad by paying twice his market value; the money goes to
-- the rival. The seller is looked up here, never passed in, so no client ever needs another account's id.
-- A previous version took (player, seller, price) and counted colors instead of levels (Azul and Blanco are one level);
-- it is dropped, so only this one can be called.

alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check check (kind in ('signed', 'sold', 'clause'));
alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('bid_won', 'bid_lost', 'market_open', 'jornada_closed', 'clause_taken'));

drop function if exists pay_release_clause(uuid, uuid, bigint);

create function pay_release_clause(p_player uuid, p_price bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := auth.uid();
  v_seller uuid;
  v_group text;
  v_price bigint;
  v_name text;
  v_was_starter boolean;
begin
  if v_buyer is null then
    raise exception 'not signed in';
  end if;

  -- Same lock the daily close takes, so a clause never interleaves with the market resolving.
  perform pg_advisory_xact_lock(hashtext('ptg.close_cycle'));

  select user_id into v_seller from squads where player_id = p_player;
  if v_seller is null or v_seller = v_buyer then
    raise exception 'clause unavailable';
  end if;
  perform 1 from profiles where user_id in (v_buyer, v_seller) order by user_id for update;
  -- The squad may have changed while we waited for the locks.
  if not exists (select 1 from squads where player_id = p_player and user_id = v_seller for update) then
    raise exception 'clause unavailable';
  end if;

  select gc.group_name, p.value::bigint * 2, p.display_name into v_group, v_price, v_name
  from players p join game_colors gc on gc.name = p.color
  where p.id = p_player and p.active;
  if v_price is null then
    raise exception 'clause unavailable';
  end if;
  if v_price <> p_price then
    raise exception 'clause price changed';
  end if;

  if (select count(*) from squads s join players p on p.id = s.player_id join game_colors gc on gc.name = p.color
      where s.user_id = v_seller and gc.group_name = v_group) <= 2 then
    raise exception 'clause squad minimum';
  end if;

  update profiles set budget = budget - v_price where user_id = v_buyer and budget >= v_price;
  if not found then
    raise exception 'clause insufficient budget';
  end if;
  update profiles set budget = budget + v_price where user_id = v_seller;

  delete from lineups where user_id = v_seller and player_id = p_player;
  v_was_starter := found;
  update squads set user_id = v_buyer where player_id = p_player;

  -- A starter that leaves is replaced by the seller's best bench player of the same level.
  if v_was_starter then
    insert into lineups (user_id, player_id)
    select v_seller, s.player_id
    from squads s join players p on p.id = s.player_id join game_colors gc on gc.name = p.color
    where s.user_id = v_seller and gc.group_name = v_group
      and s.player_id not in (select player_id from lineups where user_id = v_seller)
    order by p.value desc, p.id
    limit 1;
  end if;

  insert into activity (kind, user_id, player_id, amount) values ('clause', v_buyer, p_player, v_price);
  insert into notification_outbox (user_id, kind, data)
  values (v_seller, 'clause_taken', jsonb_build_object(
    'player', v_name, 'amount', v_price, 'buyer', (select team_name from profiles where user_id = v_buyer)));
end;
$$;

revoke execute on function pay_release_clause(uuid, bigint) from public, anon;
grant execute on function pay_release_clause(uuid, bigint) to authenticated;
