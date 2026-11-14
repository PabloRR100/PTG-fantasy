import type { SupabaseClient } from "@supabase/supabase-js";
import { cycleBoundsFor, cycleDateFor } from "@/services/cycles";
import { buildStandings, type CyclePointsRow, type StandingRow, type TeamRow } from "@/services/standings";
import type { Color } from "@/services/lineup";
import { fetchAllPages } from "@/lib/paginate";
import type { DirectoryRow } from "@/services/player-directory";
import { buildPlayerStats, type MatchRow, type ResultRow, type SnapshotRow } from "@/services/player-stats";

// Reads for the pages. Plain table reads joined here rather than PostgREST embeds, so each query is
// one RLS-visible table and the join is ordinary, testable TypeScript. Writes go through RPCs only.

export type Profile = { user_id: string; team_name: string; budget: number; is_admin: boolean };
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
  const result = await db.from("profiles").select("user_id, team_name, budget, is_admin").eq("user_id", userId).maybeSingle();
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
  const [teams, rows] = await Promise.all([
    db.from("profiles").select("user_id, team_name").then((r) => unwrap<TeamRow[]>(r, "load teams")),
    db.from("manager_cycle_points").select("user_id, cycle_date, points").then((r) => unwrap<CyclePointsRow[]>(r, "load standings")),
  ]);
  return buildStandings(teams, rows, cycleDateFor(now));
}

/**
 * Every player with the public name of the team that owns them (null = free), their PTG numbers and what the
 * imported matches say about them. Account ids stay here: the only owner information that leaves this
 * function is `profiles.team_name`. Match tables grow with every match, so they are read page by page.
 */
export async function getPlayerDirectory(db: SupabaseClient): Promise<DirectoryRow[]> {
  const [players, squads, teams, matches, results, snapshots] = await Promise.all([
    fetchAllPages<{ id: string; display_name: string; color: Color; value: number; matches_played: number; ratio: number }>(
      "load players", (from, to) => db.from("players").select("id, display_name, color, value, matches_played, ratio").order("id").range(from, to)),
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

  return players.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id, name: p.display_name, color: p.color, value: p.value, owner: ownerOf.get(p.id) ?? null,
      matches: p.matches_played, winRate: Number(p.ratio),
      called: s?.called ?? 0, points: s?.points ?? 0, average: s && s.played > 0 ? s.points / s.played : null,
    };
  });
}
