import { describe, expect, test } from "vitest";
import { resolveLevels, type GroupRanking } from "@/services/levels";

const ranked = (id: string, name = id, matchesPlayed = 0) => ({ ptgPlayerId: id, displayName: name, matchesPlayed, ratio: 0 });
const group = (gender: "male" | "female", level: string, groupId: string, ...players: ReturnType<typeof ranked>[]): GroupRanking => ({
  gender,
  level,
  groupId,
  players,
});

describe("resolveLevels: the color of a player is the group of the current semester he is in", () => {
  test("a player in one group of a game color is loadable with that color, gender and group", () => {
    const out = resolveLevels([group("male", "Azul", "g-azul", ranked("p1", "DANIELO"))]);
    expect(out.loadable).toEqual([
      { ptgPlayerId: "p1", displayName: "DANIELO", matchesPlayed: 0, ratio: 0, color: "Azul", gender: "male", groupId: "g-azul" },
    ]);
    expect(out.ambiguous).toEqual([]);
    expect(out.outOfGame).toEqual([]);
  });

  test("women's groups load as female in the same colors", () => {
    const out = resolveLevels([group("female", "Rosa", "g-f-rosa", ranked("p2"))]);
    expect(out.loadable[0]).toMatchObject({ color: "Rosa", gender: "female", groupId: "g-f-rosa" });
  });

  test("a player in two groups is ambiguous: not loadable, and both groups are reported", () => {
    const out = resolveLevels([group("male", "Azul", "g1", ranked("p3", "Guille", 1)), group("male", "Verde", "g2", ranked("p3", "Guille", 1))]);
    expect(out.loadable).toEqual([]);
    expect(out.ambiguous).toEqual([
      { ptgPlayerId: "p3", displayName: "Guille", groups: [{ gender: "male", level: "Azul" }, { gender: "male", level: "Verde" }] },
    ]);
  });

  test("a game-color group plus a level the game does not know is still ambiguous (we do not know the level)", () => {
    const out = resolveLevels([group("male", "Azul", "g1", ranked("p4")), group("male", "Turquesa", "g2", ranked("p4"))]);
    expect(out.ambiguous.map((a) => a.ptgPlayerId)).toEqual(["p4"]);
    expect(out.loadable).toEqual([]);
    expect(out.outOfGame).toEqual([]);
  });

  test("a player in the same level for both genders is ambiguous", () => {
    const out = resolveLevels([group("male", "Blanco", "g1", ranked("p5")), group("female", "Blanco", "g2", ranked("p5"))]);
    expect(out.ambiguous.map((a) => a.ptgPlayerId)).toEqual(["p5"]);
  });

  test("a player only in a level the game does not know (a color PTG adds later) is out of game, not loaded", () => {
    const out = resolveLevels([group("male", "Turquesa", "g3", ranked("p6", "Nacho"))]);
    expect(out.loadable).toEqual([]);
    expect(out.outOfGame).toEqual([{ ptgPlayerId: "p6", displayName: "Nacho", level: "Turquesa", gender: "male" }]);
  });

  test("a group listing the same player twice does not make him ambiguous", () => {
    const out = resolveLevels([group("male", "Verde", "g4", ranked("p7"), ranked("p7"))]);
    expect(out.loadable).toHaveLength(1);
    expect(out.ambiguous).toEqual([]);
  });

  test("counts per category cover every group, including the ones the game does not use", () => {
    const out = resolveLevels([
      group("male", "Azul", "g1", ranked("a"), ranked("b")),
      group("female", "Azul", "g2", ranked("c")),
      group("male", "Turquesa", "g3", ranked("d")),
    ]);
    expect(out.perGroup).toEqual([
      { gender: "male", level: "Azul", groupId: "g1", read: 2, loadable: 2 },
      { gender: "female", level: "Azul", groupId: "g2", read: 1, loadable: 1 },
      { gender: "male", level: "Turquesa", groupId: "g3", read: 1, loadable: 0 },
    ]);
  });
});

describe("Azul and Blanco are one level, so a player in both is not ambiguous for the game", () => {
  test("he is loadable; the color shown is the group where he has played more", () => {
    const out = resolveLevels([group("male", "Azul", "gA", ranked("q1", "Gonzalorex", 0)), group("male", "Blanco", "gB", ranked("q1", "Gonzalorex", 4))]);
    expect(out.ambiguous).toEqual([]);
    expect(out.loadable).toEqual([expect.objectContaining({ ptgPlayerId: "q1", color: "Blanco", groupId: "gB", matchesPlayed: 4 })]);
  });
  test("on a tie he is shown as Blanco, the higher level", () => {
    const out = resolveLevels([group("male", "Azul", "gA", ranked("q2", "Guille", 1)), group("male", "Blanco", "gB", ranked("q2", "Guille", 1))]);
    expect(out.loadable[0]).toMatchObject({ color: "Blanco", groupId: "gB" });
  });
  test("more matches in Azul shows Azul", () => {
    const out = resolveLevels([group("male", "Azul", "gA", ranked("q3", "Ale", 3)), group("male", "Blanco", "gB", ranked("q3", "Ale", 1))]);
    expect(out.loadable[0]).toMatchObject({ color: "Azul", groupId: "gA" });
  });
  test("the men's and the women's group of the same level are still ambiguous (two different people categories)", () => {
    const out = resolveLevels([group("male", "Azul", "gA", ranked("q4")), group("female", "Blanco", "gB", ranked("q4"))]);
    expect(out.ambiguous.map((a) => a.ptgPlayerId)).toEqual(["q4"]);
  });
  test("Azul plus Verde stays ambiguous: different levels", () => {
    const out = resolveLevels([group("male", "Azul", "gA", ranked("q5")), group("male", "Verde", "gV", ranked("q5"))]);
    expect(out.ambiguous.map((a) => a.ptgPlayerId)).toEqual(["q5"]);
  });
  test("Azul + Blanco + Verde stays ambiguous: one of them is a different level", () => {
    const out = resolveLevels([group("male", "Azul", "gA", ranked("q6")), group("male", "Blanco", "gB", ranked("q6")), group("male", "Verde", "gV", ranked("q6"))]);
    expect(out.ambiguous.map((a) => a.ptgPlayerId)).toEqual(["q6"]);
  });
});

describe("presentIds", () => {
  test("lists every id in any group: loadable and ambiguous alike, once each", () => {
    const out = resolveLevels([group("male", "Azul", "g1", ranked("a"), ranked("b")), group("male", "Verde", "g2", ranked("b"), ranked("c"))]);
    expect([...out.presentIds].sort()).toEqual(["a", "b", "c"]);
  });
});
