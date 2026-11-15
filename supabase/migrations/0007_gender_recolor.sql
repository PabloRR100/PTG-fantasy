-- Women's categories and level changes.
--
-- 1. players.gender: PTG ranks men and women in separate groups of the same color. The game rules do not
--    mention gender (a squad is 3 per color, a lineup 2 per color), so both play in the same market; the
--    column keeps them tellable apart. Existing rows come from the men's rankings.
-- 2. A player's color is refreshed from the current semester's ranking, so a player can move between colors
--    while a manager owns him. The squad may drift (nothing requires 3 per color after the draw) but the
--    lineup must stay 2 per color, so every ingest repairs the lineups it broke.

alter table players add column gender text not null default 'male' check (gender in ('male', 'female'));

-- Rebuilds every lineup that is not 8 starters, 2 per color, from the manager's own squad: current starters
-- first (best value first), then the best bench players of the color. A manager whose squad has fewer than
-- 2 players of some color cannot have a valid lineup; that lineup is kept as it is and counted in 'impossible'
-- (the manager has to buy a player of that color). Idempotent: valid lineups are never touched.
create function repair_lineups() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_keep uuid[];
  v_repaired int := 0;
  v_impossible int := 0;
begin
  for v_user in
    select p.user_id from profiles p
    where not (
      (select count(*) from lineups l where l.user_id = p.user_id) = 8
      and (select count(*) from (
             select pl.color from lineups l join players pl on pl.id = l.player_id
             where l.user_id = p.user_id group by pl.color having count(*) = 2
           ) ok) = 4
    )
  loop
    select array_agg(player_id) into v_keep
    from (
      select s.player_id,
             row_number() over (
               partition by pl.color
               order by (l.player_id is not null) desc, pl.value desc, pl.id
             ) as rn
      from squads s
      join players pl on pl.id = s.player_id
      left join lineups l on l.user_id = s.user_id and l.player_id = s.player_id
      where s.user_id = v_user
    ) ranked
    where rn <= 2;

    if coalesce(array_length(v_keep, 1), 0) < 8 then
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

-- As 0003, plus gender (absent means male, what the scraper sent before) and the lineup repair. The market value
-- is still set once, when the player first appears. A recolored player keeps his id, so squads, bids and history
-- stay attached to him.
create or replace function ingest_players(p_players jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into players (ptg_player_id, display_name, color, group_id, gender, matches_played, ratio, value)
  select (e ->> 'ptg_player_id')::uuid, e ->> 'display_name', e ->> 'color', (e ->> 'group_id')::uuid,
         coalesce(e ->> 'gender', 'male'), (e ->> 'matches_played')::int, (e ->> 'ratio')::numeric, (e ->> 'value')::int
  from jsonb_array_elements(p_players) e
  on conflict (ptg_player_id) do update set
    display_name = excluded.display_name,
    color = excluded.color,
    group_id = excluded.group_id,
    gender = excluded.gender,
    matches_played = excluded.matches_played,
    ratio = excluded.ratio,
    updated_at = now();
  get diagnostics v_count = row_count;
  perform repair_lineups();
  return v_count;
end;
$$;

-- See 0001: the API roles hold EXECUTE by default. Only the scraper's service role may ingest or repair.
revoke execute on function repair_lineups(), ingest_players(jsonb) from public, anon, authenticated;
