-- Web push: device subscriptions, notification preferences and an outbox that close_cycle fills.
-- Nothing here sends anything: the dispatcher (src/app/api/cron/push) claims pending outbox rows and
-- sends them, so a failed delivery can never roll back or delay the market close.

-- One row per device (browser) of a manager. endpoint_hash = SHA-256 of the push endpoint URL, computed by
-- src/lib/push-endpoint.ts; (user, hash) is the identity, so subscribing twice from one device is one row.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  subscription jsonb not null,
  endpoint_hash text not null,
  created_at timestamptz not null default now()
);
create unique index push_subscriptions_user_endpoint on push_subscriptions (user_id, endpoint_hash);

-- What a manager wants to hear about. No row means everything on.
create table notification_prefs (
  user_id uuid primary key references profiles (user_id) on delete cascade,
  bids boolean not null default true,
  market boolean not null default true,
  updated_at timestamptz not null default now()
);

-- What happened that someone should hear about. `data` holds facts (player, amount); the wording lives in
-- src/services/notifications.ts, so a copy change never needs a migration.
create table notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (user_id) on delete cascade,
  kind text not null check (kind in ('bid_won', 'bid_lost', 'market_open')),
  data jsonb not null default '{}',
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz
);
create index notification_outbox_pending on notification_outbox (id) where state in ('pending', 'sending');

alter table push_subscriptions enable row level security;
alter table notification_prefs enable row level security;
alter table notification_outbox enable row level security; -- no policies: only the service role reads or writes it

create policy push_subscriptions_own_select on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_own_insert on push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_subscriptions_own_update on push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_own_delete on push_subscriptions for delete to authenticated using (user_id = auth.uid());

create policy notification_prefs_own_select on notification_prefs for select to authenticated using (user_id = auth.uid());
create policy notification_prefs_own_insert on notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy notification_prefs_own_update on notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The dispatcher's claim: the oldest pending rows, plus rows a crashed run left in 'sending' for over 10 minutes.
-- SKIP LOCKED so two overlapping cron runs never take the same row.
create function claim_notifications(p_limit int default 200) returns setof notification_outbox
language sql security definer set search_path = public as $$
  update notification_outbox o
  set state = 'sending', claimed_at = now()
  where o.id in (
    select id from notification_outbox
    where state = 'pending' or (state = 'sending' and claimed_at < now() - interval '10 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*
$$;

revoke execute on function claim_notifications(int) from public, anon, authenticated;

-- Closes a cycle: resolves every open listing, snapshots lineups, opens tomorrow's listings (size: see
-- market_listings_per_color in 0005) and queues the notifications the managers get about it.
-- Without p_force it acts only when it is 06:00 Madrid and the cycle has not been closed yet, so
-- a schedule that fires at both 04:00 and 05:00 UTC (DST-proof) acts exactly once a day.
-- p_now exists so tests can pin the clock. Returns the cycle date, or null when it did nothing.
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
-- CREATE OR REPLACE keeps the existing grants; stated again so this file is correct on its own.
revoke execute on function close_cycle(boolean, timestamptz) from public, anon, authenticated;
