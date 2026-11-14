import { describe, expect, test } from "vitest";
import { lineupProblem, toggleStarter, type SquadPlayer } from "@/services/lineup";

const squad: SquadPlayer[] = (["Blanco", "Azul", "Verde", "Rosa"] as const).flatMap((color) =>
  [1, 2, 3].map((n) => ({ id: `${color}-${n}`, color })),
);
const valid = ["Blanco-1", "Blanco-2", "Azul-1", "Azul-2", "Verde-1", "Verde-2", "Rosa-1", "Rosa-2"];

describe("lineupProblem", () => {
  test("a lineup with 2 per color is valid", () => expect(lineupProblem(valid, squad)).toBeNull());
  test("fewer than 8 says how many are missing", () => {
    expect(lineupProblem(valid.slice(0, 7), squad)).toMatch(/Rosa/);
  });
  test("3 of one color is rejected", () => {
    const three = [...valid.slice(0, 7), "Rosa-3", "Blanco-3"].filter((id) => id !== "Rosa-2");
    expect(lineupProblem(three, squad)).toMatch(/Blanco/);
  });
  test("a player outside the squad is rejected", () => {
    expect(lineupProblem([...valid.slice(0, 7), "Rosa-9"], squad)).toMatch(/plantilla/);
  });
});

describe("toggleStarter", () => {
  test("adds a player while the color has room", () => {
    expect(toggleStarter(valid.filter((id) => id !== "Rosa-2"), "Rosa-2", squad)).toContain("Rosa-2");
  });
  test("removes a selected player", () => {
    expect(toggleStarter(valid, "Rosa-2", squad)).not.toContain("Rosa-2");
  });
  test("adding a third of a color drops the oldest selected of that color", () => {
    const next = toggleStarter(valid, "Rosa-3", squad);
    expect(next.filter((id) => id.startsWith("Rosa"))).toEqual(["Rosa-2", "Rosa-3"]);
    expect(next).toHaveLength(8);
  });
});
