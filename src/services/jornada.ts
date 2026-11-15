import { cycleDateFor } from "@/services/cycles";
import { weekStartFor, type CyclePointsRow, type TeamRow } from "@/services/standings";
import type { MatchRow, ResultRow } from "@/services/player-stats";

/** A jornada is a Monday-to-Sunday week of cycles, like the "Semana" column of the standings. */

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "9 – 15 nov" (or "27 oct – 2 nov" when the week spans two months). */
export function jornadaLabel(weekStart: string): string {
  const [from, to] = [new Date(`${weekStart}T00:00:00Z`), new Date(`${addDays(weekStart, 6)}T00:00:00Z`)];
  const left = from.getUTCMonth() === to.getUTCMonth() ? `${from.getUTCDate()}` : `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]}`;
  return `${left} – ${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]}`;
}

export const nextWeek = (weekStart: string) => addDays(weekStart, 7);
export const previousWeek = (weekStart: string) => addDays(weekStart, -7);

export type WeekRank = TeamRow & { points: number; rank: number };

/** Every team ranked by the points of one week; equal points share a rank, teams without points score 0. */
export function weekRanking(teams: TeamRow[], rows: CyclePointsRow[], weekStart: string): WeekRank[] {
  const entries = teams.map((team) => ({
    ...team,
    points: rows.filter((r) => r.user_id === team.user_id && weekStartFor(r.cycle_date) === weekStart).reduce((sum, r) => sum + r.points, 0),
  }));
  entries.sort((a, b) => b.points - a.points || a.team_name.localeCompare(b.team_name, "es"));
  return entries.map((entry) => ({ ...entry, rank: entries.findIndex((e) => e.points === entry.points) + 1 }));
}

/** Weeks to browse, newest first: every week with a cycle on record plus the running one. */
export function jornadaWeeks(cycleDates: string[], currentCycleDate: string): string[] {
  const weeks = new Set(cycleDates.map(weekStartFor));
  weeks.add(weekStartFor(currentCycleDate));
  return [...weeks].sort().reverse();
}

export type PlayerInfo = { id: string; display_name: string; color: string };
export type JornadaPlayer = {
  id: string;
  name: string;
  color: string;
  /** Points scored on the days the team had him as a starter (these count). */
  counted: number;
  /** Points scored on the other days while he was in the squad (these did not count). */
  missed: number;
  /** Days he was a starter this week. */
  daysCalled: number;
};
export type TeamJornada = { players: JornadaPlayer[]; counted: number; missed: number };

/**
 * One team's week: for every player, what he scored as a starter and what he scored when he was not called up.
 * Starters come from the team's 06:00 snapshots (so they are exact); the bench is today's squad, because the squad
 * of a past day is not stored. Walkovers score nothing and are skipped.
 */
export function teamJornada(input: {
  weekStart: string;
  snapshots: { cycle_date: string; player_id: string }[];
  squadIds: string[];
  matches: MatchRow[];
  results: ResultRow[];
  players: PlayerInfo[];
}): TeamJornada {
  const { weekStart, snapshots, squadIds, matches, results, players } = input;
  const info = new Map(players.map((p) => [p.id, p]));
  const called = new Set(snapshots.filter((s) => weekStartFor(s.cycle_date) === weekStart).map((s) => `${s.cycle_date}|${s.player_id}`));
  const squad = new Set(squadIds);
  const cycleOf = new Map(matches.filter((m) => !m.walkover).map((m) => [m.id, cycleDateFor(new Date(m.played_at))]));
  const byPlayer = new Map<string, JornadaPlayer>();
  const entry = (id: string): JornadaPlayer | null => {
    const p = info.get(id);
    if (!p) return null;
    if (!byPlayer.has(id)) byPlayer.set(id, { id, name: p.display_name, color: p.color, counted: 0, missed: 0, daysCalled: 0 });
    return byPlayer.get(id)!;
  };

  for (const key of called) {
    const row = entry(key.split("|")[1]);
    if (row) row.daysCalled += 1;
  }
  for (const r of results) {
    const cycle = cycleOf.get(r.match_id);
    if (!cycle || weekStartFor(cycle) !== weekStart) continue;
    if (called.has(`${cycle}|${r.player_id}`)) {
      const row = entry(r.player_id);
      if (row) row.counted += r.points;
    } else if (squad.has(r.player_id)) {
      const row = entry(r.player_id);
      if (row) row.missed += r.points;
    }
  }
  const list = [...byPlayer.values()].sort((a, b) => b.counted - a.counted || b.missed - a.missed || a.name.localeCompare(b.name, "es"));
  return { players: list, counted: list.reduce((s, p) => s + p.counted, 0), missed: list.reduce((s, p) => s + p.missed, 0) };
}

/** One team in a closed jornada's Tablón card. */
export type JornadaEntry = {
  user_id: string; team: string; avatar_url: string | null;
  /** Points of the week and the rank among teams for that week. */
  points: number; rank: number;
  /** Position in the overall table once the week is in, and how many places it moved (positive = climbed). */
  overallRank: number; delta: number;
};

/** A closed jornada as a Tablón card, dated when the week ended (Monday 06:00 Madrid), as Betcomm's matchday summary. */
export type JornadaFeedRow = { kind: "jornada"; id: string; weekStart: string; created_at: string; entries: JornadaEntry[] };

/** Overall rank of every team counting only weeks up to and including `lastWeek` (equal totals share a rank). */
function overallRanks(teams: TeamRow[], rows: CyclePointsRow[], lastWeek: string | null): Map<string, number> {
  const totals = teams.map((t) => ({ id: t.user_id, name: t.team_name, total: rows.filter((r) => r.user_id === t.user_id && lastWeek !== null && weekStartFor(r.cycle_date) <= lastWeek).reduce((s, r) => s + r.points, 0) }));
  totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
  return new Map(totals.map((t) => [t.id, totals.findIndex((x) => x.total === t.total) + 1]));
}

export function jornadaFeedRows(
  teams: TeamRow[], rows: CyclePointsRow[], currentCycleDate: string, endOfWeek: (weekStart: string) => Date, limit = 6,
): JornadaFeedRow[] {
  const current = weekStartFor(currentCycleDate);
  const allWeeks = [...new Set(rows.map((r) => weekStartFor(r.cycle_date)))].sort();
  const closed = allWeeks.filter((w) => w < current).reverse().slice(0, limit);
  return closed.flatMap((weekStart) => {
    const ranked = weekRanking(teams, rows, weekStart);
    if (ranked.every((r) => r.points === 0)) return [];
    const before = allWeeks.filter((w) => w < weekStart).pop() ?? null;
    const now = overallRanks(teams, rows, weekStart);
    const was = overallRanks(teams, rows, before);
    const entries = ranked.map((r) => ({
      user_id: r.user_id, team: r.team_name, avatar_url: r.avatar_url ?? null, points: r.points, rank: r.rank,
      overallRank: now.get(r.user_id) ?? 0, delta: before === null ? 0 : (was.get(r.user_id) ?? 0) - (now.get(r.user_id) ?? 0),
    }));
    return [{ kind: "jornada" as const, id: `jornada-${weekStart}`, weekStart, created_at: endOfWeek(weekStart).toISOString(), entries }];
  });
}

export type JornadaRow = { key: string; id: string; name: string; color: string; points: number; counted: boolean };

/**
 * The rows of a team's jornada table: first the players who were starters (their points count), then, shaded, those
 * who scored while not called up (their points did not count). A player who did both gets a row in each part.
 */
export function jornadaRows(detail: TeamJornada): JornadaRow[] {
  const starters = detail.players.filter((p) => p.daysCalled > 0 || p.counted > 0).map((p) => ({ key: `${p.id}-in`, id: p.id, name: p.name, color: p.color, points: p.counted, counted: true }));
  const bench = detail.players.filter((p) => p.missed > 0).map((p) => ({ key: `${p.id}-out`, id: p.id, name: p.name, color: p.color, points: p.missed, counted: false }));
  return [...starters.sort((a, b) => b.points - a.points), ...bench.sort((a, b) => b.points - a.points)];
}
