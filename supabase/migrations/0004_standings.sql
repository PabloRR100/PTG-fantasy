-- Standings input: the points each manager earned in each cycle. A manager scores for the starters in
-- their lineup snapshot of the cycle (taken at 06:00 Madrid), not for whoever starts now.
-- security_invoker: the caller's RLS applies. Snapshots, matches and results are readable by every
-- signed-in user, so everyone sees everyone's points, which is the point of a league table.
create view manager_cycle_points with (security_invoker = true) as
select s.user_id, s.cycle_date, sum(mp.points)::int as points
from lineup_snapshots s
join match_players mp on mp.player_id = s.player_id
join ptg_matches m on m.id = mp.match_id and cycle_date_of(m.played_at) = s.cycle_date
group by s.user_id, s.cycle_date;
