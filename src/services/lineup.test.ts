import { describe, expect, test } from "vitest";
import { COLORS, LEVELS, levelOf, lineupProblem, toggleStarter, type SquadPlayer } from "@/services/lineup";

// Azul and Blanco are one level for the squad and the lineup (0012); every other color is its own.
const squad: SquadPlayer[] = COLORS.flatMap((color) => [1, 2, 3].map((n) => ({ id: `${color}-${n}`, color })));
const valid = LEVELS.flatMap((level) => {
  const members = squad.filter((p) => levelOf(p.color) === level.name);
  return [members[0].id, members[1].id];
});

describe("levels", () => {
  test("Blanco and Azul share one level, the other eight colors are their own", () => {
    expect(levelOf("Azul")).toBe("Azul y Blanco");
    expect(levelOf("Blanco")).toBe("Azul y Blanco");
    expect(LEVELS).toHaveLength(9);
    expect(LEVELS.find((l) => l.name === "Azul y Blanco")!.colors).toEqual(["Blanco", "Azul"]);
    expect(LEVELS.flatMap((l) => l.colors)).toEqual([...COLORS]);
  });
});

describe("lineupProblem", () => {
  test("2 starters of every level is valid", () => {
    expect(valid).toHaveLength(18);
    expect(lineupProblem(valid, squad)).toBeNull();
  });
  test("the combined level takes any mix: 2 Blancos, 2 Azules or one of each", () => {
    const rest = valid.filter((id) => levelOf(id.split("-")[0]) !== "Azul y Blanco");
    for (const pair of [["Blanco-1", "Blanco-2"], ["Azul-1", "Azul-2"], ["Blanco-1", "Azul-1"]]) {
      expect(lineupProblem([...pair, ...rest], squad)).toBeNull();
    }
  });
  test("a third starter in the combined level is rejected, naming the level", () => {
    const rest = valid.filter((id) => levelOf(id.split("-")[0]) !== "Azul y Blanco");
    expect(lineupProblem(["Blanco-1", "Blanco-2", "Azul-1", ...rest], squad)).toMatch(/Azul y Blanco/);
  });
  test("one starter short says which level is missing one", () => {
    expect(lineupProblem(valid.slice(0, -1), squad)).toMatch(/Naranja/);
  });
  test("a player outside the squad is rejected", () => {
    expect(lineupProblem([...valid.slice(0, 7), "Rosa-9"], squad)).toMatch(/plantilla/);
  });
});

describe("toggleStarter", () => {
  test("adds a player while the level has room", () => {
    expect(toggleStarter(valid.filter((id) => id !== "Rosa-2"), "Rosa-2", squad)).toContain("Rosa-2");
  });
  test("removes a selected player", () => {
    expect(toggleStarter(valid, "Rosa-2", squad)).not.toContain("Rosa-2");
  });
  test("adding a third of a level drops the oldest selected of that level", () => {
    const next = toggleStarter(valid, "Rosa-3", squad);
    expect(next.filter((id) => id.startsWith("Rosa"))).toEqual(["Rosa-2", "Rosa-3"]);
    expect(next).toHaveLength(valid.length);
  });
  test("in the combined level, a third pick drops the oldest of either color", () => {
    const start = ["Blanco-1", "Azul-1", ...valid.filter((id) => levelOf(id.split("-")[0]) !== "Azul y Blanco")];
    const next = toggleStarter(start, "Blanco-2", squad);
    expect(next).not.toContain("Blanco-1");
    expect(next).toEqual(expect.arrayContaining(["Azul-1", "Blanco-2"]));
    expect(next).toHaveLength(18);
  });
});
