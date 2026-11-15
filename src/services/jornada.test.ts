import { describe, expect, it } from "vitest";
import { jornadaFeedRows, jornadaRows, jornadaLabel, jornadaWeeks, teamJornada, weekRanking } from "@/services/jornada";

const teams = [{ user_id: "a", team_name: "Alfa" }, { user_id: "b", team_name: "Beta" }, { user_id: "c", team_name: "Cero" }];
const rows = [
  { user_id: "a", cycle_date: "2026-11-09", points: 10 }, { user_id: "a", cycle_date: "2026-11-10", points: 5 },
  { user_id: "b", cycle_date: "2026-11-09", points: 15 }, { user_id: "b", cycle_date: "2026-11-16", points: 99 },
];

describe("weekRanking", () => {
  it("ranks by the week's points, ties share a rank and silent teams score 0", () => {
    const r = weekRanking(teams, rows, "2026-11-09");
    expect(r.map((x) => [x.team_name, x.points, x.rank])).toEqual([["Alfa", 15, 1], ["Beta", 15, 1], ["Cero", 0, 3]]);
  });
});

describe("jornadaLabel / jornadaWeeks", () => {
  it("labels a week and one spanning two months", () => {
    expect(jornadaLabel("2026-11-09")).toBe("9 – 15 nov");
    expect(jornadaLabel("2026-10-26")).toBe("26 oct – 1 nov");
  });
  it("lists weeks newest first and always includes the running one", () => {
    expect(jornadaWeeks(["2026-11-03", "2026-11-10"], "2026-11-15")).toEqual(["2026-11-09", "2026-11-02"]);
    expect(jornadaWeeks([], "2026-11-15")).toEqual(["2026-11-09"]);
  });
});

describe("teamJornada", () => {
  const players = [{ id: "p1", display_name: "Uno", color: "Azul" }, { id: "p2", display_name: "Dos", color: "Rosa" }, { id: "p3", display_name: "Tres", color: "Oro" }];
  // 12:00 UTC = 13:00/14:00 Madrid, inside the cycle of that date.
  const matches = [
    { id: "m1", played_at: "2026-11-10T12:00:00Z", walkover: false },
    { id: "m2", played_at: "2026-11-11T12:00:00Z", walkover: false },
    { id: "m3", played_at: "2026-11-11T13:00:00Z", walkover: true },
    { id: "m4", played_at: "2026-11-18T12:00:00Z", walkover: false },
  ];
  const results = [
    { match_id: "m1", player_id: "p1", points: 8 }, { match_id: "m1", player_id: "p2", points: 4 },
    { match_id: "m2", player_id: "p1", points: 6 }, { match_id: "m2", player_id: "p3", points: 9 },
    { match_id: "m3", player_id: "p1", points: 50 }, { match_id: "m4", player_id: "p1", points: 70 },
  ];
  const input = { weekStart: "2026-11-09", snapshots: [{ cycle_date: "2026-11-10", player_id: "p1" }, { cycle_date: "2026-11-10", player_id: "p3" }], squadIds: ["p1", "p2"], matches, results, players };

  it("counts starter points per day, separates what the bench scored and ignores walkovers and other weeks", () => {
    const j = teamJornada(input);
    const by = Object.fromEntries(j.players.map((p) => [p.name, p]));
    expect(by.Uno).toMatchObject({ counted: 8, missed: 6, daysCalled: 1 }); // started Tue only: m1 counts, m2 (Wed) did not
    expect(by.Dos).toMatchObject({ counted: 0, missed: 4, daysCalled: 0 });
    expect(by.Tres).toMatchObject({ counted: 0, missed: 0, daysCalled: 1 }); // called, scored on a day he was not; not in the squad now, so not listed as missed
    expect(j.counted).toBe(8);
    expect(j.missed).toBe(10);
  });
  it("sorts by counted points", () => {
    expect(teamJornada(input).players[0].name).toBe("Uno");
  });
});

describe("jornadaFeedRows", () => {
  const end = (w: string) => new Date(`${w}T04:00:00Z`);
  it("makes one card per closed week with every team, its week points, overall rank and movement", () => {
    const wk = [
      { user_id: "a", cycle_date: "2026-11-02", points: 30 }, { user_id: "b", cycle_date: "2026-11-02", points: 10 },
      { user_id: "a", cycle_date: "2026-11-09", points: 5 }, { user_id: "b", cycle_date: "2026-11-09", points: 40 },
    ];
    const out = jornadaFeedRows(teams, wk, "2026-11-17", end, new Date("2026-11-17T09:00:00Z"));
    expect(out.map((o) => o.weekStart)).toEqual(["2026-11-09", "2026-11-02"]);
    expect(out.map((o) => o.live)).toEqual([false, false]);
    const latest = out[0].entries.map((e) => [e.team, e.points, e.rank, e.overallRank, e.delta]);
    // Beta won the week (40) and climbed from 2nd to 1st (50 vs 35); Alfa fell; Cero never played.
    expect(latest).toEqual([["Beta", 40, 1, 1, 1], ["Alfa", 5, 2, 2, -1], ["Cero", 0, 3, 3, 0]]);
    expect(out[1].entries.every((e) => e.delta === 0)).toBe(true); // first week: nothing to move from
  });
  it("shows the running week live, dated now, with the movement so far, ahead of the closed ones", () => {
    const wk = [
      { user_id: "a", cycle_date: "2026-11-02", points: 30 }, { user_id: "b", cycle_date: "2026-11-02", points: 10 },
      { user_id: "b", cycle_date: "2026-11-10", points: 40 },
    ];
    const now = new Date("2026-11-12T09:00:00Z");
    const out = jornadaFeedRows(teams, wk, "2026-11-12", end, now);
    expect(out.map((o) => [o.weekStart, o.live])).toEqual([["2026-11-09", true], ["2026-11-02", false]]);
    expect(out[0].created_at).toBe(now.toISOString());
    expect(out[0].entries[0]).toMatchObject({ team: "Beta", points: 40, overallRank: 1, delta: 1 });
  });
  it("makes no card for a running week with no points yet", () => {
    expect(jornadaFeedRows(teams, [{ user_id: "a", cycle_date: "2026-11-02", points: 5 }], "2026-11-10", end, new Date("2026-11-10T09:00:00Z")).map((o) => o.weekStart)).toEqual(["2026-11-02"]);
  });
});

describe("jornadaRows", () => {
  it("lists starters first, then shaded bench rows; a player who did both appears in each part", () => {
    const rows = jornadaRows({ counted: 8, missed: 10, players: [
      { id: "p1", name: "Uno", color: "Azul", counted: 8, missed: 6, daysCalled: 1 },
      { id: "p2", name: "Dos", color: "Rosa", counted: 0, missed: 4, daysCalled: 0 },
      { id: "p3", name: "Tres", color: "Oro", counted: 0, missed: 0, daysCalled: 1 },
    ] });
    expect(rows.map((r) => [r.name, r.points, r.counted])).toEqual([["Uno", 8, true], ["Tres", 0, true], ["Uno", 6, false], ["Dos", 4, false]]);
  });
});
