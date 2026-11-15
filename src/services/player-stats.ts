import { cycleDateFor } from "@/services/cycles";

export type MatchRow = { id: string; played_at: string; walkover: boolean };
export type ResultRow = { match_id: string; player_id: string; points: number };
export type SnapshotRow = { cycle_date: string; player_id: string };

/** What the imported matches say about one player. */
export type PlayerStats = {
  /** Matches played (a walkover is not one). */
  played: number;
  /** Fantasy points over those matches. */
  points: number;
  /** Of those matches, how many were played while the player was in some team's lineup. */
  called: number;
};

/**
 * Per-player totals from the imported matches. "Called up" (convocado) means the player was a starter in a
 * lineup snapshot of the cycle the match belongs to, i.e. the 06:00 Madrid lineup that day; the cycle rule is
 * the same one scoring uses (cycleDateFor), so a match counts as called exactly when it scored for someone.
 */
export function buildPlayerStats(matches: MatchRow[], results: ResultRow[], snapshots: SnapshotRow[]): Map<string, PlayerStats> {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const lineups = new Set(snapshots.map((s) => `${s.cycle_date}|${s.player_id}`));
  const stats = new Map<string, PlayerStats>();

  for (const result of results) {
    const match = matchById.get(result.match_id);
    if (!match || match.walkover) continue;
    const entry = stats.get(result.player_id) ?? { played: 0, points: 0, called: 0 };
    entry.played += 1;
    entry.points += result.points;
    if (lineups.has(`${cycleDateFor(new Date(match.played_at))}|${result.player_id}`)) entry.called += 1;
    stats.set(result.player_id, entry);
  }
  return stats;
}
