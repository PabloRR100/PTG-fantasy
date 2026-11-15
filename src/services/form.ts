import { cycleDateFor } from "@/services/cycles";
import { weekStartFor } from "@/services/standings";
import type { MatchRow, ResultRow } from "@/services/player-stats";

export type Trend = "up" | "down" | "flat";

const WEEKS_BEFORE = 3;
/** The latest week must differ from the earlier average by this share and by at least MIN_STEP points to count. */
const RELATIVE_STEP = 0.2;
const MIN_STEP = 2;

/**
 * "Momento de forma": is the player scoring more or less than in the weeks before? `weeks` are fantasy points per
 * jornada (a Monday-to-Sunday week), oldest first, closed weeks only (the running week would always look like a
 * drop). The latest week is compared with the average of up to the three before it. Null when there is nothing
 * to compare: fewer than two weeks, or no points at all.
 */
export function formTrend(weeks: number[]): Trend | null {
  if (weeks.length < 2 || weeks.every((w) => w === 0)) return null;
  const latest = weeks[weeks.length - 1];
  const before = weeks.slice(-1 - WEEKS_BEFORE, -1);
  const average = before.reduce((sum, w) => sum + w, 0) / before.length;
  const diff = latest - average;
  if (Math.abs(diff) < MIN_STEP || Math.abs(diff) < average * RELATIVE_STEP) return "flat";
  return diff > 0 ? "up" : "down";
}

/**
 * Fantasy points per closed jornada for every player who has results, oldest first, `count` weeks ending the week
 * before the one that contains `now`; weeks without matches are 0. A week belongs to the cycle rule the scoring
 * uses (06:00 Madrid), so a match at 02:00 on Monday counts for the previous week, like in the standings.
 * Walkovers score nothing and are skipped.
 */
export function weeklyPointsByPlayer(matches: MatchRow[], results: ResultRow[], now: Date, count: number): Map<string, number[]> {
  const currentWeek = weekStartFor(cycleDateFor(now));
  const weekStarts: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(`${currentWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    weekStarts.push(d.toISOString().slice(0, 10));
  }
  const weekOf = new Map(matches.filter((m) => !m.walkover).map((m) => [m.id, weekStartFor(cycleDateFor(new Date(m.played_at)))]));
  const out = new Map<string, number[]>();
  for (const r of results) {
    const week = weekOf.get(r.match_id);
    const index = week === undefined ? -1 : weekStarts.indexOf(week);
    if (index === -1) continue;
    const weeks = out.get(r.player_id) ?? weekStarts.map(() => 0);
    weeks[index] += r.points;
    out.set(r.player_id, weeks);
  }
  return out;
}
