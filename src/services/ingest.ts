import { initialValue, type Color } from "@/services/valuation";
import { scoreMatch, type SetResult } from "@/services/scoring";
import type { ParsedMatch, ParsedPlayer } from "@/lib/ptg/types";
import type { Gender, LoadablePlayer } from "@/services/levels";

export type PlayerPayload = {
  ptg_player_id: string;
  display_name: string;
  color: Color;
  group_id: string;
  gender: Gender;
  matches_played: number;
  ratio: number;
  value: number;
};

export type MatchPayload = {
  ptg_match_id: string;
  played_at: string;
  club: string;
  walkover: boolean;
  players: { ptg_player_id: string; won: boolean; sets_won: number; sets_lost: number; points: number }[];
};

/** The shape of supabase-js `.rpc()`, so the scraper can pass `supabase.rpc.bind(supabase)`. */
export type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Players already placed in a level by resolveLevels (src/services/levels.ts), ready for the ingest_players RPC. */
export function buildPlayersPayload(players: LoadablePlayer[]): PlayerPayload[] {
  return players.map((r) => ({
    ptg_player_id: r.ptgPlayerId,
    display_name: r.displayName,
    color: r.color,
    group_id: r.groupId,
    gender: r.gender,
    matches_played: r.matchesPlayed,
    ratio: r.ratio,
    value: initialValue({ color: r.color, ratio: r.ratio, matchesPlayed: r.matchesPlayed }),
  }));
}

/** Scores a finished match for each of its four players. Unfinished matches produce nothing. */
export function buildMatchPayload(match: ParsedMatch): MatchPayload | null {
  if (!match.finished) return null;
  const fromA: SetResult[] = match.sets.map((s) => ({ mine: s.a, theirs: s.b }));
  const fromB: SetResult[] = match.sets.map((s) => ({ mine: s.b, theirs: s.a }));
  const entries = (pair: ParsedPlayer[], sets: SetResult[]) =>
    pair.map((p) => {
      const score = scoreMatch({ sets, walkover: match.walkover });
      return { ptg_player_id: p.ptgPlayerId, won: score.won, sets_won: score.setsWon, sets_lost: score.setsLost, points: score.points };
    });
  return {
    ptg_match_id: match.ptgMatchId,
    played_at: match.playedAt,
    club: match.club,
    walkover: match.walkover,
    players: [...entries(match.pairA, fromA), ...entries(match.pairB, fromB)],
  };
}

async function call(rpc: Rpc, fn: string, label: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn} ${label}: ${error.message}`);
  return data;
}

export async function ingestPlayers(rpc: Rpc, players: PlayerPayload[]): Promise<number> {
  return (await call(rpc, "ingest_players", `(${players.length} players)`, { p_players: players })) as number;
}

export async function ingestMatch(rpc: Rpc, match: MatchPayload): Promise<{ inserted: number; skipped: number }> {
  return (await call(rpc, "ingest_match", match.ptg_match_id, { p_match: match })) as { inserted: number; skipped: number };
}
