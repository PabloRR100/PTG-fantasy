-- Protection after a signing: a player who just joined a team (won in the market or taken by clause) cannot be taken by
-- clause for 3 days. Without it a player could be clause-snatched back the minute he arrived, and a signing would mean nothing.
-- Starting squads (create_manager, draws) are not signings and are not protected.

alter table squads add column protected_until timestamptz;

-- close_cycle records every market signing in `activity`; that row is the signal, so close_cycle itself is untouched.
create function protect_new_signing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update squads set protected_until = now() + interval '3 days' where player_id = new.player_id;
  return new;
end;
$$;
create trigger activity_protects_signing after insert on activity
  for each row when (new.kind = 'signed') execute function protect_new_signing();

create or replace function pay_release_clause(p_player uuid, p_price bigint) returns void
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

  perform pg_advisory_xact_lock(hashtext('ptg.close_cycle'));

  select user_id into v_seller from squads where player_id = p_player;
  if v_seller is null or v_seller = v_buyer then
    raise exception 'clause unavailable';
  end if;
  perform 1 from profiles where user_id in (v_buyer, v_seller) order by user_id for update;
  if not exists (select 1 from squads where player_id = p_player and user_id = v_seller for update) then
    raise exception 'clause unavailable';
  end if;

  select gc.group_name, p.value::bigint * 2 + s.clause_extra, p.display_name into v_group, v_price, v_name
  from players p join game_colors gc on gc.name = p.color join squads s on s.player_id = p.id
  where p.id = p_player and p.active;
  if v_price is null then
    raise exception 'clause unavailable';
  end if;
  if (select protected_until from squads where player_id = p_player) > now() then
    raise exception 'clause protected';
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
  update squads set user_id = v_buyer, clause_extra = 0, protected_until = now() + interval '3 days' where player_id = p_player;

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
