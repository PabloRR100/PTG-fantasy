-- Editable clauses. A player's clause is twice his market value (the floor) plus an "extra" his owner chose to protect
-- him. Raising the extra locks half of the increase from the owner's budget; lowering it gives the same half back, so
-- protection costs liquidity (money not available for bids), not wealth. The extra never goes above twice the value
-- (a clause of at most four times the value) and moves in steps of 10,000.
-- A new owner (bid, clause) starts from the floor: the extra is reset when the squad row changes hands, and the money
-- locked in it is not returned (it went with the player).

alter table squads add column clause_extra int not null default 0 check (clause_extra >= 0 and clause_extra % 10000 = 0);

create function set_clause_extra(p_player uuid, p_extra int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_value int;
  v_old int;
  v_delta int;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  -- Same lock as the daily close and the clause payment, so an edit never interleaves with a clause being paid.
  perform pg_advisory_xact_lock(hashtext('ptg.close_cycle'));
  perform 1 from profiles where user_id = v_user for update;

  select s.clause_extra, p.value into v_old, v_value
  from squads s join players p on p.id = s.player_id
  where s.player_id = p_player and s.user_id = v_user for update of s;
  if not found then
    raise exception 'player is not in your squad';
  end if;
  if p_extra is null or p_extra < 0 or p_extra % 10000 <> 0 or p_extra > v_value * 2 then
    raise exception 'clause extra out of range (maximum %)', (v_value * 2) / 10000 * 10000;
  end if;

  v_delta := p_extra - v_old;
  if v_delta > 0 then
    update profiles set budget = budget - v_delta / 2 where user_id = v_user and budget >= v_delta / 2;
    if not found then
      raise exception 'clause insufficient budget';
    end if;
  elsif v_delta < 0 then
    update profiles set budget = budget - v_delta / 2 where user_id = v_user; -- v_delta is negative: a refund
  end if;
  update squads set clause_extra = p_extra where player_id = p_player;
end;
$$;
revoke execute on function set_clause_extra(uuid, int) from public, anon;
grant execute on function set_clause_extra(uuid, int) to authenticated;

-- The clause a rival pays now includes the extra; the buyer starts from the floor.
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
  update squads set user_id = v_buyer, clause_extra = 0 where player_id = p_player;

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
