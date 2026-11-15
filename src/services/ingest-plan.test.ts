import { describe, expect, test } from "vitest";
import { GENDERS, LEVELS, planPlayers, rankingFileName, summarizeChanges } from "@/services/ingest-plan";

// Builds a ranking page shaped like PTG's live one: filter chips, a results link with the group id, one row per player.
const chip = (cta: string, label: string, selected: boolean, extra = "") =>
  `<button type="button" class="${selected ? "bg-court text-paper" : "bg-paper"}" data-cta-id="ranking_all_scope_${cta}">${label}${extra}</button>`;
const row = (id: string, name: string, pj: number) =>
  `<a data-cta-id="ranking_to_player_profile" href="/perfil/${id}"><span>1</span><p><span>${name}</span><span>${name}</span></p><span>${pj}</span><span>50<span>%</span></span></a>`;
const page = (gender: "male" | "female", level: string, groupId: string, players: [string, string, number][], period = "1S27", current = true) =>
  `<main>${chip("period", period, true, current ? "<span>En curso</span>" : "")}${chip("gender", gender === "male" ? "Masculino" : "Femenino", true)}${chip("level", level, true)}` +
  `<a href="/ranking/resultados?ciudad=c&amp;grupo=${groupId}">r</a>${players.map(([i, n, pj]) => row(i, n, pj)).join("")}</main>`;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Every group of PTG, empty unless a page is given for it. */
function site(pages: Record<string, string>) {
  const all: Record<string, string> = {};
  let n = 100;
  for (const gender of GENDERS) for (const level of LEVELS) all[rankingFileName(gender, level)] = page(gender, level, uuid(n++), []);
  return (name: string) => ({ ...all, ...pages })[name] ?? null;
}

describe("planPlayers", () => {
  test("places each player by his group, prices new ones and carries the gender", () => {
    const read = site({
      [rankingFileName("male", "Azul")]: page("male", "Azul", uuid(1), [[uuid(10), "DANIELO", 0]]),
      [rankingFileName("female", "Verde")]: page("female", "Verde", uuid(2), [[uuid(11), "Marta", 20]]),
    });
    const plan = planPlayers(read);
    expect(plan.season).toBe("1S27");
    expect(plan.payload).toEqual([
      expect.objectContaining({ ptg_player_id: uuid(10), color: "Azul", gender: "male", group_id: uuid(1) }),
      expect.objectContaining({ ptg_player_id: uuid(11), color: "Verde", gender: "female", group_id: uuid(2) }),
    ]);
  });

  test("a player in two groups is reported, not loaded", () => {
    const read = site({
      [rankingFileName("male", "Azul")]: page("male", "Azul", uuid(1), [[uuid(10), "Guille", 1]]),
      [rankingFileName("male", "Verde")]: page("male", "Verde", uuid(2), [[uuid(10), "Guille", 1]]),
    });
    const plan = planPlayers(read);
    expect(plan.payload).toEqual([]);
    expect(plan.resolved.ambiguous.map((a) => a.ptgPlayerId)).toEqual([uuid(10)]);
  });

  test("a missing ranking file names the group instead of loading a partial picture", () => {
    const read = (name: string) => (name === rankingFileName("female", "Rosa") ? null : site({})(name));
    expect(() => planPlayers(read)).toThrow(/ranking-female-Rosa\.html/);
  });

  test("an empty (0-byte) ranking file counts as missing", () => {
    const read = (name: string) => (name === rankingFileName("male", "Blanco") ? "" : site({})(name));
    expect(() => planPlayers(read)).toThrow(/ranking-male-Blanco\.html/);
  });

  test("a page for a past semester is refused", () => {
    const read = site({ [rankingFileName("male", "Azul")]: page("male", "Azul", uuid(1), [], "2S26", false) });
    expect(() => planPlayers(read)).toThrow(/2S26.*not the current semester/);
  });

  test("a file whose content is another group (wrong gender or level) is refused", () => {
    const read = site({ [rankingFileName("male", "Azul")]: page("female", "Azul", uuid(1), []) });
    expect(() => planPlayers(read)).toThrow(/ranking-male-Azul\.html.*female/);
  });

  test("groups of different semesters in one folder are refused", () => {
    const read = site({ [rankingFileName("male", "Azul")]: page("male", "Azul", uuid(1), [], "1S27", true), [rankingFileName("male", "Rosa")]: page("male", "Rosa", uuid(2), [], "1S28", true) });
    expect(() => planPlayers(read)).toThrow(/several semesters/);
  });
});

describe("historical data never decides the current color", () => {
  test("an all-time ('Histórico') page is refused: it lists a player under every level he ever played", () => {
    const historic = page("male", "Azul", uuid(1), [[uuid(10), "Vet", 40]], "Histórico", false);
    expect(() => planPlayers(site({ [rankingFileName("male", "Azul")]: historic }))).toThrow(/semester/);
  });
});

describe("summarizeChanges", () => {
  const payload = (id: number, color: string, gender = "male") => ({ ptg_player_id: uuid(id), color, gender }) as never;
  test("counts new players, color changes, gender changes and unchanged ones by stable id", () => {
    const current = [
      { ptg_player_id: uuid(1), color: "Rosa", gender: "male" },
      { ptg_player_id: uuid(2), color: "Azul", gender: "male" },
      { ptg_player_id: uuid(3), color: "Verde", gender: "male" },
      { ptg_player_id: uuid(4), color: "Verde", gender: "male" },
    ];
    const s = summarizeChanges(current, [payload(1, "Azul"), payload(2, "Azul"), payload(3, "Verde", "female"), payload(9, "Rosa")]);
    expect(s).toMatchObject({ newPlayers: 1, colorChanged: 1, genderChanged: 1, unchanged: 1, notInRankings: 1 });
    expect(s.colorChanges).toEqual([{ ptgPlayerId: uuid(1), from: "Rosa", to: "Azul" }]);
  });
});
