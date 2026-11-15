import { describe, expect, test } from "vitest";
import { buildPlayerStats, type MatchRow, type ResultRow, type SnapshotRow } from "@/services/player-stats";

// 2026-11-14 06:00 Madrid = 05:00Z. A match at 10:00Z that day belongs to cycle 2026-11-14;
// one at 04:59Z belongs to the cycle before.
const matches: MatchRow[] = [
  { id: "m1", played_at: "2026-11-14T10:00:00Z", walkover: false },
  { id: "m2", played_at: "2026-11-14T04:59:00Z", walkover: false },
  { id: "m3", played_at: "2026-11-15T04:59:00Z", walkover: false },
  { id: "m4", played_at: "2026-11-15T10:00:00Z", walkover: true },
];
const results: ResultRow[] = [
  { match_id: "m1", player_id: "A", points: 8 },
  { match_id: "m2", player_id: "A", points: 3 },
  { match_id: "m3", player_id: "A", points: 5 },
  { match_id: "m4", player_id: "A", points: 0 },
  { match_id: "m1", player_id: "B", points: 1 },
];
const snapshots: SnapshotRow[] = [{ cycle_date: "2026-11-14", player_id: "A" }];

describe("buildPlayerStats", () => {
  const stats = buildPlayerStats(matches, results, snapshots);

  test("points add up over the matches the player played", () => expect(stats.get("A")?.points).toBe(16));
  test("a walkover is not a match played and adds nothing", () => expect(stats.get("A")?.played).toBe(3));
  test("convocatorias count matches played while in some team's lineup that cycle", () => {
    // m1 (cycle 11-14) and m3 (04:59Z on the 15th, still cycle 11-14) count; m2 is the cycle before; m4 is a walkover.
    expect(stats.get("A")?.called).toBe(2);
  });
  test("a player nobody lined up has 0 convocatorias even if they played", () => {
    expect(stats.get("B")).toEqual({ played: 1, points: 1, called: 0 });
  });
  test("a player with no results is simply absent", () => expect(stats.get("Z")).toBeUndefined());
  test("two teams with the same player in their snapshot count the match once", () => {
    const twice = buildPlayerStats(matches, results, [...snapshots, { cycle_date: "2026-11-14", player_id: "A" }]);
    expect(twice.get("A")?.called).toBe(2);
  });
  test("with no snapshots yet, everyone has 0 convocatorias", () => {
    const none = buildPlayerStats(matches, results, []);
    expect([...none.values()].every((s) => s.called === 0)).toBe(true);
  });
  test("a result whose match is unknown is ignored rather than crashing", () => {
    const odd = buildPlayerStats(matches, [{ match_id: "ghost", player_id: "A", points: 9 }], snapshots);
    expect(odd.size).toBe(0);
  });
});
