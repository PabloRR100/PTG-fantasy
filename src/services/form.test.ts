import { describe, expect, test } from "vitest";
import { formTrend, weeklyPointsByPlayer } from "@/services/form";

// A jornada is a Monday-to-Sunday week. The trend compares the latest closed week with the weeks before it.

describe("formTrend (weeks oldest first, closed weeks only)", () => {
  test("not enough history: no arrow", () => {
    expect(formTrend([])).toBeNull();
    expect(formTrend([10])).toBeNull();
  });
  test("a player who scored nothing at all has no trend", () => expect(formTrend([0, 0, 0])).toBeNull());
  test("clearly more than before: up", () => expect(formTrend([10, 8, 20])).toBe("up"));
  test("clearly less than before: down", () => expect(formTrend([12, 14, 4])).toBe("down"));
  test("about the same: flat", () => expect(formTrend([10, 10, 11])).toBe("flat"));
  test("a week without matches counts as zero points, so a player who stopped playing goes down", () => expect(formTrend([12, 12, 0])).toBe("down"));
  test("a player who just started (zero before, points now) goes up", () => expect(formTrend([0, 0, 9])).toBe("up"));
  test("only the three weeks before the latest count", () => {
    expect(formTrend([100, 100, 100, 10, 10, 10, 11])).toBe("flat");
  });
  test("small absolute moves are noise: 1 vs 2 points is flat", () => expect(formTrend([1, 1, 2])).toBe("flat"));
});

describe("weeklyPointsByPlayer", () => {
  const matches = [
    { id: "m1", played_at: "2026-11-03T18:00:00Z", walkover: false }, // week of Mon 2 Nov
    { id: "m2", played_at: "2026-11-10T18:00:00Z", walkover: false }, // week of Mon 9 Nov
    { id: "m3", played_at: "2026-11-11T18:00:00Z", walkover: true },  // a walkover scores nothing
    { id: "m4", played_at: "2026-11-16T09:00:00Z", walkover: false }, // week of Mon 16 Nov: the current one
  ];
  const results = [
    { match_id: "m1", player_id: "p", points: 5 }, { match_id: "m2", player_id: "p", points: 7 },
    { match_id: "m3", player_id: "p", points: 9 }, { match_id: "m4", player_id: "p", points: 99 },
  ];
  test("sums points per closed week, oldest first, with zeros for quiet weeks, and leaves the current week out", () => {
    const out = weeklyPointsByPlayer(matches, results, new Date("2026-11-17T12:00:00Z"), 4);
    expect(out.get("p")).toEqual([0, 0, 5, 7]);
  });
  test("a player with no results has no entry", () => expect(weeklyPointsByPlayer(matches, results, new Date("2026-11-17T12:00:00Z"), 4).get("ghost")).toBeUndefined());
  test("the window is the last N closed weeks", () => {
    expect(weeklyPointsByPlayer(matches, results, new Date("2026-11-17T12:00:00Z"), 2).get("p")).toEqual([5, 7]);
  });
});
