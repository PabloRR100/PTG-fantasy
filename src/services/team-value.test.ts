import { describe, expect, test } from "vitest";
import { squadValue, teamValues } from "@/services/team-value";
import { buildStandings } from "@/services/standings";
import { formatMoney } from "@/lib/format";

const players = [
  { id: "p1", value: 1_500_000 },
  { id: "p2", value: 700_000 },
  { id: "p3", value: 410_000 },
  { id: "p4", value: 2_000_000 },
];

describe("squadValue", () => {
  test("sums the current market value of every player, starters and bench alike", () => {
    expect(squadValue([{ value: 1_500_000 }, { value: 700_000 }, { value: 410_000 }])).toBe(2_610_000);
  });
  test("an empty squad is worth 0, shown as 0 €", () => {
    expect(squadValue([])).toBe(0);
    expect(formatMoney(squadValue([]))).toBe("0 €");
  });
});

describe("teamValues", () => {
  test("groups the squads by team and sums their players' values", () => {
    const squads = [
      { player_id: "p1", user_id: "a" },
      { player_id: "p2", user_id: "a" },
      { player_id: "p3", user_id: "b" },
    ];
    const byTeam = teamValues(squads, players);
    expect(byTeam.get("a")).toBe(2_200_000);
    expect(byTeam.get("b")).toBe(410_000);
    expect(byTeam.get("nobody")).toBeUndefined(); // an empty team is filled in as 0 by the standings
  });
  test("a player nobody owns counts for no team", () => {
    expect(teamValues([{ player_id: "p1", user_id: "a" }], players).get("a")).toBe(1_500_000);
  });
  test("a squad row whose player is unreadable adds nothing instead of NaN", () => {
    expect(teamValues([{ player_id: "ghost", user_id: "a" }, { player_id: "p3", user_id: "a" }], players).get("a")).toBe(410_000);
  });
});

describe("both screens agree", () => {
  const teams = [{ user_id: "a", team_name: "Alfa" }, { user_id: "b", team_name: "Beta" }, { user_id: "c", team_name: "Vacío" }];
  const squads = [
    { player_id: "p1", user_id: "a" }, { player_id: "p4", user_id: "a" }, { player_id: "p3", user_id: "b" },
  ];

  test("the Clasificación value of a team equals squadValue of that team's players (what Equipo shows)", () => {
    const table = buildStandings(teams, [], "2026-11-14", teamValues(squads, players));
    for (const team of teams) {
      const mine = squads.filter((s) => s.user_id === team.user_id).map((s) => players.find((p) => p.id === s.player_id)!);
      expect(table.find((r) => r.user_id === team.user_id)!.teamValue).toBe(squadValue(mine));
    }
  });
  test("an empty team appears with 0, and the table still ranks by points", () => {
    const table = buildStandings(teams, [{ user_id: "b", cycle_date: "2026-11-14", points: 3 }], "2026-11-14", teamValues(squads, players));
    expect(table.map((r) => [r.team_name, r.teamValue])).toEqual([["Beta", 410_000], ["Alfa", 3_500_000], ["Vacío", 0]]);
  });
  test("without values the column is 0, so older callers keep working", () => {
    expect(buildStandings(teams, [], "2026-11-14").every((r) => r.teamValue === 0)).toBe(true);
  });
});
