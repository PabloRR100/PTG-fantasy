-- PTG Fantasy core schema. Rules: docs/GAMEPLAY.md. Market resolution lives in 0002_market.sql.
--
-- Access model: every table has RLS on. Reads are open for shared data (players, matches, squads,
-- standings) and owner-only for private data (lineups, bids). There are NO insert/update/delete
-- policies, so the only way to change ownership or money is through the security-definer functions.

create table players (
  id uuid primary key default gen_random_uuid(),
  ptg_player_id uuid not null unique,
  display_name text not null,
  color text not null check (color in ('Blanco', 'Azul', 'Verde', 'Rosa')),
  group_id uuid not null,
  matches_played int not null default 0 check (matches_played >= 0),
  ratio numeric not null default 0 check (ratio between 0 and 1),
  value int not null check (value >= 0),
  updated_at timestamptz not null default now()
);

create table ptg_matches (
  id uuid primary key default gen_random_uuid(),
  ptg_match_id uuid not null unique,
  played_at timestamptz not null,
  club text not null,
  walkover boolean not null default false
);

-- One row per player per match; points are computed by src/services/scoring.ts at ingest time.
create table match_players (
  match_id uuid not null references ptg_matches (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  won boolean not null,
  sets_won int not null check (sets_won >= 0),
  sets_lost int not null check (sets_lost >= 0),
  points int not null check (points >= 0),
  primary key (match_id, player_id)
);
create index match_players_player_idx on match_players (player_id);

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_name text not null check (char_length(team_name) between 2 and 30),
  budget int not null default 5000000 check (budget >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- player_id is the primary key: a player belongs to at most one manager.
create table squads (
  player_id uuid primary key references players (id),
  user_id uuid not null references profiles (user_id) on delete cascade
);
create index squads_user_idx on squads (user_id);

create table lineups (
  user_id uuid not null references profiles (user_id) on delete cascade,
  player_id uuid not null references squads (player_id) on delete cascade,
  primary key (user_id, player_id)
);

create table market_listings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  seller_id uuid references profiles (user_id) on delete set null,
  status text not null default 'open' check (status in ('open', 'sold', 'expired')),
  closes_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references market_listings (id) on delete cascade,
  user_id uuid not null references profiles (user_id) on delete cascade,
  amount int not null check (amount > 0),
  created_at timestamptz not null default clock_timestamp()
);
create index bids_listing_idx on bids (listing_id, amount desc, created_at);

-- One row per closed 06:00 Madrid cycle; the primary key makes a second close a no-op.
create table cycles (
  cycle_date date primary key,
  closed_at timestamptz not null default now()
);

-- Who had which starters when a cycle began; matches score for the snapshot, not the live lineup.
create table lineup_snapshots (
  cycle_date date not null,
  user_id uuid not null references profiles (user_id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  primary key (cycle_date, user_id, player_id)
);

alter table players enable row level security;
alter table ptg_matches enable row level security;
alter table match_players enable row level security;
alter table profiles enable row level security;
alter table squads enable row level security;
alter table lineups enable row level security;
alter table market_listings enable row level security;
alter table bids enable row level security;
alter table cycles enable row level security;
alter table lineup_snapshots enable row level security;

create policy players_read on players for select to authenticated using (true);
create policy ptg_matches_read on ptg_matches for select to authenticated using (true);
create policy match_players_read on match_players for select to authenticated using (true);
create policy profiles_read on profiles for select to authenticated using (true);
create policy squads_read on squads for select to authenticated using (true);
create policy market_listings_read on market_listings for select to authenticated using (true);
create policy cycles_read on cycles for select to authenticated using (true);
create policy lineup_snapshots_read on lineup_snapshots for select to authenticated using (true);
create policy lineups_own on lineups for select to authenticated using (user_id = auth.uid());
create policy bids_own on bids for select to authenticated using (user_id = auth.uid());

-- Creates the caller's team: profile, a random squad of 12 (3 free players per color) and the
-- best two of each color as starters. The caller is auth.uid(): never a client-supplied id.
create function create_manager(p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
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

  if (select count(*) from squads where user_id = v_user) <> 12 then
    raise exception 'not enough free players to build a squad (need 3 free players in each of 4 colors)';
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

-- Replaces the caller's starters. Must be 8 distinct players from their own squad, 2 per color.
create function set_lineup(p_players uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_foreign uuid;
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

  if (select count(distinct pid) from unnest(p_players) as pid) <> 8
     or (select count(*) from (
           select p.color from players p where p.id = any (p_players)
           group by p.color having count(*) = 2
         ) ok) <> 4 then
    raise exception 'lineup needs exactly 2 players per color (8 in total)';
  end if;

  delete from lineups where user_id = v_user;
  insert into lineups (user_id, player_id) select v_user, pid from unnest(p_players) as pid;
end;
$$;

revoke execute on function create_manager(text), set_lineup(uuid[]) from public;
grant execute on function create_manager(text), set_lineup(uuid[]) to authenticated;
do $$
begin
  -- Supabase grants execute to anon by default; this role does not exist in a plain Postgres.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function create_manager(text), set_lineup(uuid[]) from anon;
  end if;
end $$;
