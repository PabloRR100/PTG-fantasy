import { describe, expect, test } from "vitest";
import { buildStandings, weekStartFor } from "@/services/standings";

describe("weekStartFor", () => {
  test("a Monday is its own week start", () => expect(weekStartFor("2026-11-09")).toBe("2026-11-09"));
  test("a Sunday belongs to the week that began on the previous Monday", () => expect(weekStartFor("2026-11-15")).toBe("2026-11-09"));
  test("crosses a month boundary", () => expect(weekStartFor("2026-12-02")).toBe("2026-11-30"));
});

describe("buildStandings", () => {
  const teams = [
    { user_id: "a", team_name: "Alfa" },
    { user_id: "b", team_name: "Beta" },
    { user_id: "c", team_name: "Gamma" },
  ];
  const rows = [
    { user_id: "a", cycle_date: "2026-11-10", points: 5 },
    { user_id: "a", cycle_date: "2026-11-14", points: 10 },
    { user_id: "b", cycle_date: "2026-11-14", points: 20 },
    { user_id: "b", cycle_date: "2026-11-02", points: 30 },
  ];

  test("ranks by total, with the current week alongside", () => {
    const table = buildStandings(teams, rows, "2026-11-14");
    expect(table.map((r) => [r.team_name, r.total, r.week, r.rank])).toEqual([
      ["Beta", 50, 20, 1],
      ["Alfa", 15, 15, 2],
      ["Gamma", 0, 0, 3],
    ]);
  });
  test("a manager with no points still appears", () => {
    expect(buildStandings(teams, [], "2026-11-14")).toHaveLength(3);
  });
  test("equal totals share a rank and are ordered by name", () => {
    const t = buildStandings(teams.slice(0, 2), [
      { user_id: "a", cycle_date: "2026-11-14", points: 4 },
      { user_id: "b", cycle_date: "2026-11-14", points: 4 },
    ], "2026-11-14");
    expect(t.map((r) => [r.team_name, r.rank])).toEqual([["Alfa", 1], ["Beta", 1]]);
  });
});
