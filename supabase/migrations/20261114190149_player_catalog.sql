create table public.player_catalog (
  ptg_player_id uuid primary key,
  display_name text not null,
  color text not null,
  gender text not null check (gender in ('male', 'female')),
  matches_played integer not null check (matches_played >= 0),
  ratio numeric not null check (ratio between 0 and 1)
);

alter table public.player_catalog enable row level security;
revoke all on public.player_catalog from anon, authenticated;
grant select on public.player_catalog to authenticated;
create policy player_catalog_read on public.player_catalog
  for select to authenticated using (true);
