-- Ingest: what the local scraper calls (service role only) to load PTG data. Idempotent, so a
-- scraper run can be repeated. Points are computed upstream by src/services/scoring.ts.

-- Upserts players from a ranking page. The market value is set once, when the player first
-- appears; later runs refresh name, color, matches played and win ratio but never the value.
create function ingest_players(p_players jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into players (ptg_player_id, display_name, color, group_id, matches_played, ratio, value)
  select (e ->> 'ptg_player_id')::uuid, e ->> 'display_name', e ->> 'color', (e ->> 'group_id')::uuid,
         (e ->> 'matches_played')::int, (e ->> 'ratio')::numeric, (e ->> 'value')::int
  from jsonb_array_elements(p_players) e
  on conflict (ptg_player_id) do update set
    display_name = excluded.display_name,
    color = excluded.color,
    group_id = excluded.group_id,
    matches_played = excluded.matches_played,
    ratio = excluded.ratio,
    updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Upserts one match and its per-player results. Players the game does not track (other groups)
-- are skipped and reported back, so the caller can see what was left out.
create function ingest_match(p_match jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid;
  v_entry jsonb;
  v_player uuid;
  v_inserted int := 0;
  v_skipped int := 0;
begin
  insert into ptg_matches (ptg_match_id, played_at, club, walkover)
  values ((p_match ->> 'ptg_match_id')::uuid, (p_match ->> 'played_at')::timestamptz,
          p_match ->> 'club', coalesce((p_match ->> 'walkover')::boolean, false))
  on conflict (ptg_match_id) do update set
    played_at = excluded.played_at, club = excluded.club, walkover = excluded.walkover
  returning id into v_match;

  for v_entry in select * from jsonb_array_elements(p_match -> 'players') loop
    select id into v_player from players where ptg_player_id = (v_entry ->> 'ptg_player_id')::uuid;
    if v_player is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into match_players (match_id, player_id, won, sets_won, sets_lost, points)
    values (v_match, v_player, (v_entry ->> 'won')::boolean, (v_entry ->> 'sets_won')::int,
            (v_entry ->> 'sets_lost')::int, (v_entry ->> 'points')::int)
    on conflict (match_id, player_id) do update set
      won = excluded.won, sets_won = excluded.sets_won, sets_lost = excluded.sets_lost, points = excluded.points;
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

-- See 0001: the API roles hold EXECUTE by default. Only the scraper's service role may ingest.
revoke execute on function ingest_players(jsonb), ingest_match(jsonb) from public, anon, authenticated;
