import type { SupabaseClient } from "@supabase/supabase-js";
import { cycleBoundsFor, cycleDateFor } from "@/services/cycles";
import { jornadaFeedRows, jornadaWeeks, teamJornada, weekRanking, type JornadaFeedRow, type TeamJornada, type WeekRank } from "@/services/jornada";
import { buildStandings, type CyclePointsRow, type StandingRow, type TeamRow } from "@/services/standings";
import type { Color } from "@/services/lineup";
import { fetchAllPages } from "@/lib/paginate";
import { DEFAULT_PREFS, type Prefs } from "@/services/notifications";
import type { DirectoryRow, Gender } from "@/services/player-directory";
import type { ActivityRow, InboxRow } from "@/services/feed";
import { teamValues } from "@/services/team-value";
import { formTrend, weeklyPointsByPlayer } from "@/services/form";
import { buildPlayerStats, type MatchRow, type ResultRow, type SnapshotRow } from "@/services/player-stats";

// Reads for the pages. Plain table reads joined here rather than PostgREST embeds, so each query is
// one RLS-visible table and the join is ordinary, testable TypeScript. Writes go through RPCs only.

export type Profile = { user_id: string; team_name: string; budget: number; is_admin: boolean; avatar_url: string | null };
export type PlayerRow = { id: string; display_name: string; color: Color; value: number; matches_played: number; ratio: number };
export type SquadEntry = PlayerRow & { starter: boolean; cyclePoints: number };
export type Listing = { id: string; closes_at: string; player: PlayerRow; myBid: number | null };
export type MyBid = { listingId: string; playerName: string; color: Color; amount: number };

const PLAYER_COLUMNS = "id, display_name, color, value, matches_played, ratio";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

export async function getProfile(db: SupabaseClient, userId: string): Promise<Profile | null> {
  const result = await db.from("profiles").select("user_id, team_name, budget, is_admin, avatar_url").eq("user_id", userId).maybeSingle();
  return unwrap<Profile | null>(result, "load profile");
}

async function getPlayers(db: SupabaseClient, ids: string[]): Promise<PlayerRow[]> {
  if (ids.length === 0) return [];
  return unwrap<PlayerRow[]>(await db.from("players").select(PLAYER_COLUMNS).in("id", ids), "load players");
}

/** Points each player scored in the cycle that contains `now`. */
async function pointsThisCycle(db: SupabaseClient, playerIds: string[], now: Date): Promise<Map<string, number>> {
  const points = new Map<string, number>();
  if (playerIds.length === 0) return points;
  const { start, end } = cycleBoundsFor(now);
  const matches = unwrap<{ id: string }[]>(
    await db.from("ptg_matches").select("id").gte("played_at", start.toISOString()).lt("played_at", end.toISOString()),
    "load cycle matches",
  );
  if (matches.length === 0) return points;
  const rows = unwrap<{ player_id: string; points: number }[]>(
    await db.from("match_players").select("player_id, points").in("match_id", matches.map((m) => m.id)).in("player_id", playerIds),
    "load cycle points",
  );
  for (const row of rows) points.set(row.player_id, (points.get(row.player_id) ?? 0) + row.points);
  return points;
}

export async function getSquad(db: SupabaseClient, userId: string, now = new Date()): Promise<SquadEntry[]> {
  const squad = unwrap<{ player_id: string }[]>(await db.from("squads").select("player_id").eq("user_id", userId), "load squad");
  const starters = unwrap<{ player_id: string }[]>(await db.from("lineups").select("player_id").eq("user_id", userId), "load lineup");
  const ids = squad.map((s) => s.player_id);
  const [players, points] = await Promise.all([getPlayers(db, ids), pointsThisCycle(db, ids, now)]);
  const starterIds = new Set(starters.map((s) => s.player_id));
  return players
    .map((p) => ({ ...p, starter: starterIds.has(p.id), cyclePoints: points.get(p.id) ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

export async function getOpenListings(db: SupabaseClient, userId: string): Promise<{ listings: Listing[]; myBids: MyBid[] }> {
  const rows = unwrap<{ id: string; player_id: string; closes_at: string }[]>(
    await db.from("market_listings").select("id, player_id, closes_at").eq("status", "open").order("closes_at"),
    "load listings",
  );
  const [players, bids] = await Promise.all([
    getPlayers(db, rows.map((r) => r.player_id)),
    // RLS (bids_own) already limits this to the caller; the filter states the intent.
    unwrap<{ listing_id: string; amount: number; seq: number }[]>(
      await db.from("bids").select("listing_id, amount, seq").eq("user_id", userId).order("seq"),
      "load bids",
    ),
  ]);
  const playerById = new Map(players.map((p) => [p.id, p]));
  // A manager can bid twice on a listing; the highest one is the one that counts.
  const bestBid = new Map<string, number>();
  for (const bid of bids) bestBid.set(bid.listing_id, Math.max(bestBid.get(bid.listing_id) ?? 0, bid.amount));

  const listings = rows.flatMap((row) => {
    const player = playerById.get(row.player_id);
    return player ? [{ id: row.id, closes_at: row.closes_at, player, myBid: bestBid.get(row.id) ?? null }] : [];
  });
  const myBids = listings.flatMap((l) => (l.myBid === null ? [] : [{ listingId: l.id, playerName: l.player.display_name, color: l.player.color, amount: l.myBid }]));
  return { listings, myBids };
}

export async function getStandings(db: SupabaseClient, now = new Date()): Promise<StandingRow[]> {
  const [teams, rows, squads, players] = await Promise.all([
    db.from("profiles").select("user_id, team_name, avatar_url").then((r) => unwrap<TeamRow[]>(r, "load teams")),
    db.from("manager_cycle_points").select("user_id, cycle_date, points").then((r) => unwrap<CyclePointsRow[]>(r, "load standings")),
    // Team value: squads and players are readable by every signed-in user (RLS), so no private data is involved.
    fetchAllPages<{ player_id: string; user_id: string }>("load squads", (from, to) => db.from("squads").select("player_id, user_id").order("player_id").range(from, to)),
    fetchAllPages<{ id: string; value: number }>("load player values", (from, to) => db.from("players").select("id, value").order("id").range(from, to)),
  ]);
  return buildStandings(teams, rows, cycleDateFor(now), teamValues(squads, players));
}

/**
 * Every player with the public name of the team that owns them (null = free), their PTG numbers and what the
 * imported matches say about them. Account ids stay here: the only owner information that leaves this
 * function is `profiles.team_name`. Match tables grow with every match, so they are read page by page.
 */
export async function getPlayerDirectory(db: SupabaseClient): Promise<DirectoryRow[]> {
  const [players, squads, teams, matches, results, snapshots] = await Promise.all([
    fetchAllPages<{ id: string; display_name: string; color: string; gender: Gender; value: number; matches_played: number; ratio: number }>(
      "load players", (from, to) => db.from("players").select("id, display_name, color, gender, value, matches_played, ratio").eq("active", true).order("id").range(from, to)),
    fetchAllPages<{ player_id: string; user_id: string }>(
      "load owners", (from, to) => db.from("squads").select("player_id, user_id").order("player_id").range(from, to)),
    fetchAllPages<TeamRow>(
      "load teams", (from, to) => db.from("profiles").select("user_id, team_name").order("user_id").range(from, to)),
    fetchAllPages<MatchRow>(
      "load matches", (from, to) => db.from("ptg_matches").select("id, played_at, walkover").order("id").range(from, to)),
    fetchAllPages<ResultRow>(
      "load match results", (from, to) => db.from("match_players").select("match_id, player_id, points").order("match_id").order("player_id").range(from, to)),
    fetchAllPages<SnapshotRow>(
      "load lineup snapshots", (from, to) => db.from("lineup_snapshots").select("cycle_date, player_id, user_id").order("cycle_date").order("user_id").order("player_id").range(from, to)),
  ]);

  const teamName = new Map(teams.map((t) => [t.user_id, t.team_name]));
  const ownerOf = new Map(squads.map((s) => [s.player_id, teamName.get(s.user_id) ?? null]));
  const stats = buildPlayerStats(matches, results, snapshots);
  const weekly = weeklyPointsByPlayer(matches, results, new Date(), 4);

  return players.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id, name: p.display_name, gender: p.gender, color: p.color, value: p.value, owner: ownerOf.get(p.id) ?? null,
      matches: p.matches_played, winRate: Number(p.ratio),
      called: s?.called ?? 0, points: s?.points ?? 0, average: s && s.played > 0 ? s.points / s.played : null,
      trend: formTrend(weekly.get(p.id) ?? []),
    };
  });
}

/** The Tablón: the latest operations between teams and the market, newest first. Names come from tables everyone can read. */
export async function getActivity(db: SupabaseClient, limit = 50): Promise<ActivityRow[]> {
  const rows = unwrap<{ id: number; kind: ActivityRow["kind"]; user_id: string; player_id: string; amount: number; created_at: string }[]>(
    await db.from("activity").select("id, kind, user_id, player_id, amount, created_at").order("id", { ascending: false }).limit(limit),
    "load activity",
  );
  if (rows.length === 0) return [];
  const [teams, players] = await Promise.all([
    db.from("profiles").select("user_id, team_name, avatar_url").in("user_id", [...new Set(rows.map((r) => r.user_id))]).then((r) => unwrap<TeamRow[]>(r, "load teams")),
    db.from("players").select("id, display_name, color, gender").in("id", [...new Set(rows.map((r) => r.player_id))]).then((r) =>
      unwrap<{ id: string; display_name: string; color: Color; gender: Gender }[]>(r, "load activity players")),
  ]);
  const team = new Map(teams.map((t) => [t.user_id, t]));
  const player = new Map(players.map((p) => [p.id, p]));
  return rows.flatMap((r) => {
    const p = player.get(r.player_id);
    return p ? [{ id: r.id, kind: r.kind, team: team.get(r.user_id)?.team_name ?? null, avatar_url: team.get(r.user_id)?.avatar_url ?? null, player: p.display_name, color: p.color, gender: p.gender, amount: r.amount, created_at: r.created_at }] : [];
  });
}

/** This manager's inbox, newest first. RLS limits it to their own rows; the filter states the intent. */
export async function getInbox(db: SupabaseClient, userId: string, limit = 50): Promise<InboxRow[]> {
  return unwrap<InboxRow[]>(
    await db.from("notification_outbox").select("id, kind, data, created_at, read_at").eq("user_id", userId).order("id", { ascending: false }).limit(limit),
    "load inbox",
  );
}

export async function getUnreadCount(db: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await db.from("notification_outbox").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  if (error) throw new Error(`count unread: ${error.message}`);
  return count ?? 0;
}

/** What this manager wants to be told about. No stored row means everything on. */
export async function getNotificationPrefs(db: SupabaseClient, userId: string): Promise<Prefs> {
  const row = unwrap<{ bids: boolean; market: boolean; jornada: boolean } | null>(
    await db.from("notification_prefs").select("bids, market, jornada").eq("user_id", userId).maybeSingle(),
    "load notification preferences",
  );
  return row ? { bids: row.bids, market: row.market, jornada: row.jornada } : DEFAULT_PREFS;
}

/** The Tablón's jornada cards: the running week and the last finished ones, from the same points the standings use. */
export async function getJornadaFeed(db: SupabaseClient, now = new Date()): Promise<JornadaFeedRow[]> {
  const [teams, rows] = await Promise.all([
    db.from("profiles").select("user_id, team_name, avatar_url").then((r) => unwrap<TeamRow[]>(r, "load teams")),
    db.from("manager_cycle_points").select("user_id, cycle_date, points").then((r) => unwrap<CyclePointsRow[]>(r, "load points")),
  ]);
  return jornadaFeedRows(teams, rows, cycleDateFor(now), (weekStart) => cycleBoundsFor(new Date(`${weekStart}T12:00:00Z`)).end, now, 6);
}

export type JornadaView = { weeks: string[]; weekStart: string; ranking: WeekRank[] };

/** The weeks to browse and the ranking of every team in the chosen one (the running week when none is given). */
export async function getJornada(db: SupabaseClient, weekStart: string | null, now = new Date()): Promise<JornadaView> {
  const currentCycle = cycleDateFor(now);
  const [teams, rows, cycles] = await Promise.all([
    db.from("profiles").select("user_id, team_name, avatar_url").then((r) => unwrap<TeamRow[]>(r, "load teams")),
    db.from("manager_cycle_points").select("user_id, cycle_date, points").then((r) => unwrap<CyclePointsRow[]>(r, "load points")),
    db.from("cycles").select("cycle_date").then((r) => unwrap<{ cycle_date: string }[]>(r, "load cycles")),
  ]);
  const weeks = jornadaWeeks([...cycles.map((c) => c.cycle_date), ...rows.map((r) => r.cycle_date)], currentCycle);
  const week = weekStart && weeks.includes(weekStart) ? weekStart : weeks[0];
  const ranking = weekRanking(teams, rows, week);
  return { weeks, weekStart: week, ranking };
}

/** The players of one team in one jornada. Snapshots, squads, matches and results are readable by every signed-in user (RLS). */
export async function getTeamJornada(db: SupabaseClient, teamUserId: string, weekStart: string): Promise<TeamJornada> {
  const lastDay = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  const start = cycleBoundsFor(new Date(`${weekStart}T12:00:00Z`)).start;
  const end = cycleBoundsFor(new Date(`${lastDay}T12:00:00Z`)).end;
  const [snapshots, squad, matches] = await Promise.all([
    db.from("lineup_snapshots").select("cycle_date, player_id").eq("user_id", teamUserId).gte("cycle_date", weekStart).lte("cycle_date", lastDay).then((r) => unwrap<{ cycle_date: string; player_id: string }[]>(r, "load snapshots")),
    db.from("squads").select("player_id").eq("user_id", teamUserId).then((r) => unwrap<{ player_id: string }[]>(r, "load squad")),
    db.from("ptg_matches").select("id, played_at, walkover").gte("played_at", start.toISOString()).lt("played_at", end.toISOString()).then((r) => unwrap<MatchRow[]>(r, "load week matches")),
  ]);
  const results = matches.length === 0 ? [] : await fetchAllPages<ResultRow>(
    "load week results", (from, to) => db.from("match_players").select("match_id, player_id, points").in("match_id", matches.map((m) => m.id)).order("match_id").order("player_id").range(from, to));
  const ids = [...new Set([...snapshots.map((s) => s.player_id), ...squad.map((s) => s.player_id), ...results.map((r) => r.player_id)])];
  const players = ids.length === 0 ? [] : await fetchAllPages<{ id: string; display_name: string; color: string }>(
    "load jornada players", (from, to) => db.from("players").select("id, display_name, color").in("id", ids).order("id").range(from, to));
  return teamJornada({ weekStart, snapshots, squadIds: squad.map((s) => s.player_id), matches, results, players });
}

export type TeamPlayer = { id: string; name: string; color: string; value: number; starter: boolean };
export type TeamView = { user_id: string; team_name: string; avatar_url: string | null; players: TeamPlayer[]; teamValue: number; lineupDate: string | null };

/**
 * Another team as everyone can see it: its squad, with "starter" taken from its latest lineup snapshot (the 06:00 lineup
 * that scores today). A team's live lineup is private (RLS), but the snapshots are public, so that is what we can show.
 */
export async function getTeamView(db: SupabaseClient, teamUserId: string): Promise<TeamView | null> {
  const team = unwrap<TeamRow | null>(await db.from("profiles").select("user_id, team_name, avatar_url").eq("user_id", teamUserId).maybeSingle(), "load team");
  if (!team) return null;
  const [squad, latest] = await Promise.all([
    unwrap<{ player_id: string }[]>(await db.from("squads").select("player_id").eq("user_id", teamUserId), "load team squad"),
    unwrap<{ cycle_date: string }[]>(await db.from("lineup_snapshots").select("cycle_date").eq("user_id", teamUserId).order("cycle_date", { ascending: false }).limit(1), "load latest lineup"),
  ]);
  const lineupDate = latest[0]?.cycle_date ?? null;
  const starters = lineupDate === null ? [] : unwrap<{ player_id: string }[]>(
    await db.from("lineup_snapshots").select("player_id").eq("user_id", teamUserId).eq("cycle_date", lineupDate), "load starters");
  const starterIds = new Set(starters.map((s) => s.player_id));
  const players = (await getPlayers(db, squad.map((s) => s.player_id)))
    .map((p) => ({ id: p.id, name: p.display_name, color: p.color, value: p.value, starter: starterIds.has(p.id) }))
    .sort((a, b) => Number(b.starter) - Number(a.starter) || b.value - a.value);
  return { ...team, avatar_url: team.avatar_url ?? null, players, teamValue: players.reduce((sum, p) => sum + p.value, 0), lineupDate };
}
