-- All ten PTG levels are playable. The rules do not change, they apply to every color: a squad holds 3 players of each
-- color, a lineup 2 starters of each color, a manager keeps at least 2 of each color (0002), and the daily market lists
-- max(3, teams) free players per color (0005). With ten colors that is a squad of 30 and a lineup of 20.
--
-- The colors live in one table, so a color is added by inserting a row instead of editing every function.
-- Depends on 0006 (close_cycle is generic over colors and is not touched here) and on 0007 (repair_lineups).

create table game_colors (
  name text primary key,
  position int not null unique
);
insert into game_colors (name, position) values
  ('Blanco', 1), ('Azul', 2), ('Verde', 3), ('Rosa', 4), ('Oro', 5),
  ('Granate', 6), ('Morado', 7), ('Marrón', 8), ('Plata', 9), ('Naranja', 10);
alter table game_colors enable row level security;
create policy game_colors_read on game_colors for select to authenticated using (true);

-- players.color: the CHECK that listed four colors becomes a reference to the table.
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'players'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%Blanco%'
  loop
    execute format('alter table players drop constraint %I', v_name);
  end loop;
end;
$$;
alter table players add constraint players_color_fkey foreign key (color) references game_colors (name);

-- 0001: a new team gets 3 random free players of every color and the best 2 of each as starters.
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

-- 0001: the lineup is 2 distinct squad players of every color.
create or replace function set_lineup(p_players uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_foreign uuid;
  v_colors int := (select count(*) from game_colors);
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

  if (select count(distinct pid) from unnest(p_players) as pid) <> 2 * v_colors
     or (select count(*) from (
           select p.color from players p where p.id = any (p_players)
           group by p.color having count(*) = 2
         ) ok) <> v_colors then
    raise exception 'lineup needs exactly 2 players per color (% in total)', 2 * v_colors;
  end if;

  delete from lineups where user_id = v_user;
  insert into lineups (user_id, player_id) select v_user, pid from unnest(p_players) as pid;
end;
$$;

-- 0007: the same repair, for any number of colors.
create or replace function repair_lineups() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_keep uuid[];
  v_colors int := (select count(*) from game_colors);
  v_repaired int := 0;
  v_impossible int := 0;
begin
  for v_user in
    select p.user_id from profiles p
    where not (
      (select count(*) from lineups l where l.user_id = p.user_id) = 2 * v_colors
      and (select count(*) from (
             select pl.color from lineups l join players pl on pl.id = l.player_id
             where l.user_id = p.user_id group by pl.color having count(*) = 2
           ) ok) = v_colors
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

    if coalesce(array_length(v_keep, 1), 0) < 2 * v_colors then
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

-- Tops every existing team up to 3 players of each color with random free players (a color they have 3 or more of is
-- left alone, and nobody loses a player), then repairs the lineups. Used once when colors are added, and safe to repeat:
-- a second run adds nothing. Players with an open market listing are not drawn. Returns how many players were added
-- and for how many team-colors there were not enough free players.
create function draw_missing_players() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_color text;
  v_have int;
  v_added int;
  v_total int := 0;
  v_short int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('ptg.create_manager'));
  for v_user in select user_id from profiles order by created_at, user_id loop
    for v_color in select name from game_colors order by position loop
      select count(*) into v_have
      from squads s join players p on p.id = s.player_id
      where s.user_id = v_user and p.color = v_color;
      if v_have < 3 then
        insert into squads (player_id, user_id)
        select p.id, v_user
        from players p
        where p.color = v_color
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

-- See 0001: the API roles hold EXECUTE by default. Signed-in users keep create_manager and set_lineup only.
revoke execute on function create_manager(text), set_lineup(uuid[]), repair_lineups(), draw_missing_players() from public, anon, authenticated;
grant execute on function create_manager(text), set_lineup(uuid[]) to authenticated;
