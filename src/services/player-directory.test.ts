import { describe, expect, test } from "vitest";
import { FREE, colorLabel, filterAndSort, ownerOptions, type DirectoryRow, type DirectoryView } from "@/services/player-directory";

const row = (r: Pick<DirectoryRow, "id" | "name" | "color" | "value" | "owner"> & Partial<DirectoryRow>): DirectoryRow => ({
  gender: "male", clauseExtra: 0, protectedUntil: null, matches: 0, winRate: 0, called: 0, points: 0, average: null, trend: null, ...r,
});
const rows: DirectoryRow[] = [
  row({ id: "1", name: "Kike", color: "Blanco", value: 2_000_000, owner: "Los Pepros", matches: 280, winRate: 0.55, called: 4, points: 40, average: 5 }),
  row({ id: "2", name: "Álvaro Born", color: "Blanco", value: 1_700_000, owner: null, matches: 240, winRate: 0.57, called: 0, points: 21, average: 7 }),
  row({ id: "3", name: "Edu Laviña", color: "Azul", value: 1_500_000, owner: "Gamma", matches: 225, winRate: 0.48, called: 2, points: 6, average: 3 }),
  row({ id: "4", name: "Mario", color: "Verde", value: 900_000, owner: null, matches: 30, winRate: 0.7, called: 1, points: 0, average: null }),
  row({ id: "5", name: "Mario", color: "Rosa", value: 300_000, owner: "Los Pepros", matches: 12, winRate: 0.2, called: 0, points: 12, average: 4 }),
  row({ id: "6", name: "Zoilo", color: "Rosa", value: 250_000, owner: "Gamma", matches: 90, winRate: 0.5, called: 3, points: 9, average: 4.5 }),
];
const view = (v: Partial<DirectoryView> = {}): DirectoryView => ({
  query: "", gender: null, colors: [], owner: null, minValue: null, maxValue: null, sortKey: "value", sortDir: "desc", ...v,
});
const names = (v: Partial<DirectoryView>) => filterAndSort(rows, view(v)).map((r) => `${r.name}/${r.color}`);

describe("search", () => {
  test("matches part of a name, ignoring case", () => expect(names({ query: "kik" })).toEqual(["Kike/Blanco"]));
  test("ignores accents in both directions", () => {
    expect(names({ query: "alvaro" })).toEqual(["Álvaro Born/Blanco"]);
    expect(names({ query: "LAVIÑA" })).toEqual(["Edu Laviña/Azul"]);
    expect(names({ query: "lavina" })).toEqual(["Edu Laviña/Azul"]);
  });
  test("keeps both players who share a name", () => expect(names({ query: "mario" })).toHaveLength(2));
  test("blank or whitespace search shows everyone", () => expect(names({ query: "   " })).toHaveLength(6));
  test("the search never matches the owner's name", () => expect(names({ query: "pepros" })).toEqual([]));
});

describe("filters", () => {
  test("by one color", () => expect(names({ colors: [{ color: "Rosa" }], sortKey: "name", sortDir: "asc" })).toEqual(["Mario/Rosa", "Zoilo/Rosa"]));
  test("by several colors", () => expect(names({ colors: [{ color: "Azul" }, { color: "Verde" }] })).toEqual(["Mario/Verde", "Edu Laviña/Azul"].reverse()));
  test("by owner", () => expect(names({ owner: "Gamma" })).toEqual(["Edu Laviña/Azul", "Zoilo/Rosa"]));
  test("Libre shows only players nobody owns", () => expect(names({ owner: FREE })).toEqual(["Álvaro Born/Blanco", "Mario/Verde"]));
  test("a team called like the Libre marker is not confused with free players", () => {
    const tricky = [...rows, row({ id: "7", name: "Tricky", color: "Azul", value: 1, owner: "Libre" })];
    const result = filterAndSort(tricky, view({ owner: FREE })).map((r) => r.name);
    expect(result).toEqual(["Álvaro Born", "Mario"]);
  });
  test("minimum value is inclusive", () => expect(names({ minValue: 1_700_000 })).toEqual(["Kike/Blanco", "Álvaro Born/Blanco"]));
  test("maximum value is inclusive", () => expect(names({ maxValue: 300_000 })).toEqual(["Mario/Rosa", "Zoilo/Rosa"]));
  test("a range", () => expect(names({ minValue: 900_000, maxValue: 1_700_000 })).toEqual(["Álvaro Born/Blanco", "Edu Laviña/Azul", "Mario/Verde"]));
  test("a minimum above the maximum matches nobody", () => expect(names({ minValue: 2_000_000, maxValue: 1_000_000 })).toEqual([]));
  test("filters combine", () => expect(names({ colors: [{ color: "Blanco" }, { color: "Rosa" }], owner: FREE, query: "a" })).toEqual(["Álvaro Born/Blanco"]));
  test("does not change the input list", () => {
    const copy = JSON.stringify(rows);
    filterAndSort(rows, view({ colors: [{ color: "Rosa" }] }));
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

describe("sorting", () => {
  test("by value, both ways", () => {
    expect(names({ sortKey: "value", sortDir: "desc" })[0]).toBe("Kike/Blanco");
    expect(names({ sortKey: "value", sortDir: "asc" })[0]).toBe("Zoilo/Rosa");
  });
  test("by name, accent-aware, ties broken by color level", () => {
    expect(names({ sortKey: "name", sortDir: "asc" })).toEqual(["Álvaro Born/Blanco", "Edu Laviña/Azul", "Kike/Blanco", "Mario/Verde", "Mario/Rosa", "Zoilo/Rosa"]);
    expect(names({ sortKey: "name", sortDir: "desc" })[0]).toBe("Zoilo/Rosa");
  });
  test("by color follows PTG's level order, not the alphabet", () => {
    const order = filterAndSort(rows, view({ sortKey: "color", sortDir: "asc" })).map((r) => r.color);
    expect(order).toEqual(["Blanco", "Blanco", "Azul", "Verde", "Rosa", "Rosa"]);
  });
  test("by owner: teams alphabetically, free players last when ascending", () => {
    const order = filterAndSort(rows, view({ sortKey: "owner", sortDir: "asc" })).map((r) => r.owner ?? FREE);
    expect(order).toEqual(["Gamma", "Gamma", "Los Pepros", "Los Pepros", FREE, FREE]);
  });
  test("by owner descending puts free players first", () => {
    expect(filterAndSort(rows, view({ sortKey: "owner", sortDir: "desc" }))[0].owner).toBeNull();
  });
  test("equal values keep a stable, readable order (by name)", () => {
    const tied = [rows[3], { ...rows[0], id: "9", name: "Ana", value: 900_000 }];
    expect(filterAndSort(tied, view({ sortKey: "value" })).map((r) => r.name)).toEqual(["Ana", "Mario"]);
  });
});

describe("sorting by the player statistics", () => {
  const order = (sortKey: DirectoryView["sortKey"], sortDir: "asc" | "desc") =>
    filterAndSort(rows, view({ sortKey, sortDir })).map((r) => r.name + "/" + r.color);
  test("by matches played (PTG), most first", () => expect(order("matches", "desc").slice(0, 3)).toEqual(["Kike/Blanco", "Álvaro Born/Blanco", "Edu Laviña/Azul"]));
  test("by win rate, both ways", () => {
    expect(order("winRate", "desc")[0]).toBe("Mario/Verde");
    expect(order("winRate", "asc")[0]).toBe("Mario/Rosa");
  });
  test("by convocatorias, most first; ties by name", () => expect(order("called", "desc")).toEqual(["Kike/Blanco", "Zoilo/Rosa", "Edu Laviña/Azul", "Mario/Verde", "Álvaro Born/Blanco", "Mario/Rosa"]));
  test("by points", () => expect(order("points", "desc")[0]).toBe("Kike/Blanco"));
  test("by average: players with no matches recorded are last in either direction", () => {
    expect(order("average", "desc")).toEqual(["Álvaro Born/Blanco", "Kike/Blanco", "Zoilo/Rosa", "Mario/Rosa", "Edu Laviña/Azul", "Mario/Verde"]);
    expect(order("average", "asc").at(-1)).toBe("Mario/Verde");
    expect(order("average", "asc")[0]).toBe("Edu Laviña/Azul");
  });
});

describe("ownerOptions", () => {
  test("distinct team names alphabetically, only teams that own someone", () => {
    expect(ownerOptions(rows)).toEqual(["Gamma", "Los Pepros"]);
  });
});

describe("category (gender) and color together", () => {
  const mixed = [
    row({ id: "m1", name: "Aitor", color: "Azul", value: 900, owner: null, gender: "male" }),
    row({ id: "f1", name: "Marta", color: "Azul", value: 800, owner: null, gender: "female" }),
    row({ id: "m2", name: "Beto", color: "Rosa", value: 700, owner: null, gender: "male" }),
    row({ id: "f2", name: "Nuria", color: "Rosa", value: 600, owner: null, gender: "female" }),
  ];
  const ids = (v: Partial<DirectoryView>) => filterAndSort(mixed, view(v)).map((r) => r.id);

  test("Todos (null) keeps both categories", () => expect(ids({})).toEqual(["m1", "f1", "m2", "f2"]));
  test("Masculino / Femenino keep only that category", () => {
    expect(ids({ gender: "male" })).toEqual(["m1", "m2"]);
    expect(ids({ gender: "female" })).toEqual(["f1", "f2"]);
  });
  test("a color choice without category matches the color in both categories", () => expect(ids({ colors: [{ color: "Azul" }] })).toEqual(["m1", "f1"]));
  test("a color choice with a category matches only that variant: Azul · Femenino is not Azul · Masculino", () => {
    expect(ids({ colors: [{ color: "Azul", gender: "female" }] })).toEqual(["f1"]);
    expect(ids({ colors: [{ color: "Azul", gender: "female" }, { color: "Rosa", gender: "male" }] })).toEqual(["f1", "m2"]);
  });
  test("category and color combine (both must hold)", () => {
    expect(ids({ gender: "female", colors: [{ color: "Rosa" }] })).toEqual(["f2"]);
    expect(ids({ gender: "male", colors: [{ color: "Azul", gender: "female" }] })).toEqual([]);
  });
  test("sorting by color keeps the two categories of a color apart, men first", () => {
    expect(ids({ sortKey: "color", sortDir: "asc" })).toEqual(["m1", "f1", "m2", "f2"]);
  });
});

describe("colorLabel", () => {
  test("adds the category only when both are on screen", () => {
    expect(colorLabel({ color: "Azul", gender: "female" }, true)).toBe("Azul · Femenino");
    expect(colorLabel({ color: "Azul", gender: "male" }, true)).toBe("Azul · Masculino");
    expect(colorLabel({ color: "Azul", gender: "female" }, false)).toBe("Azul");
  });
});
