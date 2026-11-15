import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { madridToInstant } from "@/lib/madrid-time";
import { parseMatchPage } from "@/lib/ptg/parse-match";
import { parseRanking, parseRankingMeta } from "@/lib/ptg/parse-ranking";
import { parseResultsList } from "@/lib/ptg/parse-results";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/ptg/${name}`, import.meta.url)), "utf8");

const MATCH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const NOW = new Date("2026-11-14T09:00:00Z");

describe("madridToInstant", () => {
  test("winter (UTC+1): 20:00 Madrid is 19:00Z", () => {
    expect(madridToInstant(2026, 11, 9, 20, 0).toISOString()).toBe("2026-11-09T19:00:00.000Z");
  });
  test("summer (UTC+2): 20:00 Madrid is 18:00Z", () => {
    expect(madridToInstant(2026, 7, 1, 20, 0).toISOString()).toBe("2026-07-01T18:00:00.000Z");
  });
});

describe("parseResultsList", () => {
  test("returns the match ids of result links, in order, ignoring other links", () => {
    expect(parseResultsList(fixture("results-sample.html"))).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    ]);
  });
});

describe("parseRanking", () => {
  const rows = parseRanking(fixture("ranking-sample.html"));

  test("a row rendered twice appears once", () => {
    expect(rows).toHaveLength(3);
  });
  test("reads id, full name, matches played and ratio", () => {
    expect(rows[0]).toEqual({
      ptgPlayerId: "11111111-1111-4111-8111-111111111111",
      displayName: "Ana Mora",
      matchesPlayed: 54,
      ratio: 0.8,
    });
  });
  test("a player without titles still parses", () => {
    expect(rows[2]).toMatchObject({ displayName: "Carla", matchesPlayed: 15, ratio: 0.67 });
  });
  test("prefers the fully rendered copy over the streaming skeleton that comes first", () => {
    // The fixture starts with PTG's pre-hydration skeleton of row 1: same link, no win ratio.
    const first = fixture("ranking-sample.html").indexOf('href="/perfil/11111111');
    const resolved = fixture("ranking-sample.html").indexOf('href="/perfil/11111111', first + 1);
    expect(resolved).toBeGreaterThan(first);
    expect(rows[0].ratio).toBe(0.8);
  });
  test("a row that never resolves its ratio fails loudly", () => {
    const skeletonOnly = fixture("ranking-sample.html").replace(/<span>80<span>%<\/span><\/span>/g, "").replace(/<span>80<span>%<\/span>/g, "");
    expect(() => parseRanking(skeletonOnly)).toThrow(/win ratio/);
  });
  test("reads the compact span layout PTG also emits, same result as the div layout", () => {
    const compact =
      '<main><a data-cta-id="ranking_to_player_profile" href="/perfil/33333333-3333-4333-8333-333333333333"><span>3</span><span><div><img/></div></span><div><p><span>Carla</span><span>Carla</span><span>, <!-- -->Campeona</span></p></div><span>15</span><div><div><span><svg/>1<span> títulos</span></span><span>67<span>%</span></span></div></div></a></main>';
    expect(parseRanking(compact)).toEqual([
      { ptgPlayerId: "33333333-3333-4333-8333-333333333333", displayName: "Carla", matchesPlayed: 15, ratio: 0.67 },
    ]);
  });
  test("a player below the 15-match minimum shows 'N/15' and has no rank", () => {
    const unranked =
      '<main><a data-cta-id="ranking_to_player_profile" href="/perfil/55555555-5555-4555-8555-555555555555"><div><span>—</span><span>Sin posición</span></div><div><span><div><img/></div></span><div><p><span>Gina</span><span>Gina</span></p><p><span>1<!-- -->G</span></p></div></div><div><span>1<span>/<!-- -->15</span></span></div><span><span></span></span><span>100<span>%</span></span><div><span>–</span><span>Sin títulos en este grupo</span></div></a></main>';
    expect(parseRanking(unranked)).toEqual([
      { ptgPlayerId: "55555555-5555-4555-8555-555555555555", displayName: "Gina", matchesPlayed: 1, ratio: 1 },
    ]);
  });
  test("a player with no matches yet shows '0/1' and a dash instead of a ratio: ratio 0", () => {
    const noMatches =
      '<main><a data-cta-id="ranking_to_player_profile" href="/perfil/66666666-6666-4666-8666-666666666666"><span><span>—</span><span>Sin posición</span></span><span><div><img/></div></span><div><p><span>Hugo</span><span>Hugo</span></p></div><div><span>0<span>/<!-- -->1</span></span></div><div><div><span>—<span>%</span></span></div></div></a></main>';
    expect(parseRanking(noMatches)).toEqual([
      { ptgPlayerId: "66666666-6666-4666-8666-666666666666", displayName: "Hugo", matchesPlayed: 0, ratio: 0 },
    ]);
  });
  test("a dash ratio on a player who has played still fails loudly", () => {
    const odd =
      '<main><a data-cta-id="ranking_to_player_profile" href="/perfil/77777777-7777-4777-8777-777777777777"><span>2</span><div><p><span>Iker</span><span>Iker</span></p></div><span>9</span><div><span>—<span>%</span></span></div></a></main>';
    expect(() => parseRanking(odd)).toThrow(/win ratio/);
  });
  test("a non-numeric matches count fails loudly", () => {
    const broken = fixture("ranking-sample.html").replaceAll("<span>54</span>", "<span>n/a</span>");
    expect(() => parseRanking(broken)).toThrow(/matches played not found/);
  });
});

describe("parseRankingMeta", () => {
  // Shaped after PTG's live filter bar (checked against the saved 1S27 pages): the selected chip carries bg-court.
  const chip = (cta: string, label: string, selected: boolean, extra = "") =>
    `<button type="button" class="chip ${selected ? "bg-court text-paper" : "bg-paper"}" data-cta-id="ranking_all_scope_${cta}">${label}${extra}</button>`;
  const page = (period: string, gender: string, level: string) =>
    `<main>${chip("period", "Histórico", false)}${chip("period", "1S27", period === "1S27", '<span class="text-label">En curso</span>')}${chip("period", "2S26", period === "2S26")}` +
    `${chip("gender", "Femenino", gender === "Femenino")}${chip("gender", "Masculino", gender === "Masculino")}` +
    `${chip("level", "Blanco", level === "Blanco")}${chip("level", "Azul", level === "Azul")}` +
    `<a href="/ranking/resultados?ciudad=c1&amp;genero=male&amp;nivel=Azul&amp;grupo=02fc6968-c20c-b113-950d-e428c888fb82">Resultados</a></main>`;

  test("reads the selected semester, gender, level and the group id of the page", () => {
    expect(parseRankingMeta(page("1S27", "Masculino", "Azul"))).toEqual({
      season: "1S27",
      seasonIsCurrent: true,
      gender: "male",
      level: "Azul",
      groupId: "02fc6968-c20c-b113-950d-e428c888fb82",
    });
  });
  test("a past semester is not current", () => {
    expect(parseRankingMeta(page("2S26", "Femenino", "Blanco"))).toMatchObject({ season: "2S26", seasonIsCurrent: false, gender: "female" });
  });
  test("a page without a selected semester fails loudly", () => {
    expect(() => parseRankingMeta(page("none", "Masculino", "Azul"))).toThrow(/semester/);
  });
  test("a page without a results link (no group id) fails loudly", () => {
    expect(() => parseRankingMeta(page("1S27", "Masculino", "Azul").replace(/<a href.*<\/a>/, ""))).toThrow(/group id/);
  });
});

describe("parseMatchPage", () => {
  const match = parseMatchPage(fixture("match-sample.html"), MATCH_ID, NOW);

  test("reads club, finished flag and the Madrid kickoff as an instant", () => {
    expect(match).toMatchObject({
      ptgMatchId: MATCH_ID,
      club: "Club Ejemplo",
      finished: true,
      walkover: false,
      playedAt: "2026-11-09T19:00:00.000Z",
    });
  });
  test("keeps the four players in pair order with their ids", () => {
    expect(match.pairA.map((p) => p.displayName)).toEqual(["Ana", "Beto"]);
    expect(match.pairB.map((p) => p.displayName)).toEqual(["Carla", "Dani"]);
    expect(match.pairA[0].ptgPlayerId).toBe("11111111-1111-4111-8111-111111111111");
  });
  test("flags the viewer and strips the marker from the name", () => {
    expect(match.pairA[1]).toMatchObject({ displayName: "Beto", isViewer: true });
    expect(match.pairA[0].isViewer).toBe(false);
  });
  test("reads the sets from pair A's point of view", () => {
    expect(match.sets).toEqual([{ a: 2, b: 6 }, { a: 6, b: 4 }, { a: 4, b: 6 }]);
  });
  test("weekday names with accents (mié, sáb) are read", () => {
    for (const weekday of ["mié", "sáb", "dom"]) {
      const page = fixture("match-sample.html").replace("<span>lun</span>", `<span>${weekday}</span>`);
      expect(parseMatchPage(page, MATCH_ID, NOW).playedAt).toBe("2026-11-09T19:00:00.000Z");
    }
  });
  test("a date later than now belongs to the previous year", () => {
    const early = parseMatchPage(fixture("match-sample.html"), MATCH_ID, new Date("2027-01-03T09:00:00Z"));
    expect(early.playedAt).toBe("2026-11-09T19:00:00.000Z");
    const late = parseMatchPage(fixture("match-sample.html"), MATCH_ID, new Date("2026-11-03T09:00:00Z"));
    expect(late.playedAt).toBe("2025-11-09T19:00:00.000Z");
  });
  test("two players with the same name keep different ids", () => {
    const twins = fixture("match-sample.html").replace(">Carla<", ">Ana<");
    const m = parseMatchPage(twins, MATCH_ID, NOW);
    expect(m.pairA[0].displayName).toBe(m.pairB[0].displayName);
    expect(m.pairA[0].ptgPlayerId).not.toBe(m.pairB[0].ptgPlayerId);
  });
  test("a match that is not finished is reported as unfinished", () => {
    const pending = fixture("match-sample.html").replace("<em>finalizado</em>", "<em>programado</em>");
    expect(parseMatchPage(pending, MATCH_ID, NOW).finished).toBe(false);
  });
  test("a finished match with no sets is a walkover", () => {
    const noSets = fixture("match-sample.html").replace(/<div><div><div><div>Set 1.*<\/p><\/div>/s, "");
    const m = parseMatchPage(noSets, MATCH_ID, NOW);
    expect(m).toMatchObject({ finished: true, walkover: true, sets: [] });
  });
  test("a set value above 7 (tie-break?) fails loudly instead of scoring wrongly", () => {
    const tieBreak = fixture("match-sample.html").replace("<span>4</span><span>·</span><span>6</span>", "<span>10</span><span>·</span><span>6</span>");
    expect(() => parseMatchPage(tieBreak, MATCH_ID, NOW)).toThrow(/tie-break/);
  });
  test("each player rendered twice (streaming skeleton, then the real card) is one player", () => {
    const skeleton = '<div><div><div><img/></div></div></div><template id="P:1"></template></a>';
    const doubled = fixture("match-sample.html").replace(
      /<li><a data-cta-id="match_to_player_profile" href="(\/perfil\/[^"]+)">/g,
      `<li><a data-cta-id="match_to_player_profile" href="$1">${skeleton}<a data-cta-id="match_to_player_profile" href="$1">`,
    );
    const m = parseMatchPage(doubled, MATCH_ID, NOW);
    expect([...m.pairA, ...m.pairB].map((p) => p.displayName)).toEqual(["Ana", "Beto", "Carla", "Dani"]);
  });
  test("a name streamed into a hidden segment is put back where React would move it", () => {
    const card = /<div><div>Dani<\/div><div><span><span>Puesto en el grupo: <\/span>#6<\/span><\/div><\/div>/;
    const html = fixture("match-sample.html");
    const segment = card.exec(html)![0];
    const streamed = html.replace(card, '<template id="P:1"></template>').replace("</main>", `<div hidden id="S:1">${segment}</div></main>`);
    expect(parseMatchPage(streamed, MATCH_ID, NOW).pairB[1].displayName).toBe("Dani");
  });
  test("a player that only ever shows its skeleton fails loudly", () => {
    const onlySkeletons = fixture("match-sample.html").replace(
      /<div><div>(.*?)<\/div><div><span><span>Puesto en el grupo: <\/span>#\d+<\/span><\/div><\/div><\/a>/g,
      '<template id="P:1"></template></a>',
    );
    expect(() => parseMatchPage(onlySkeletons, MATCH_ID, NOW)).toThrow(/streaming skeleton/);
  });
  test("a champion title next to the name is not part of the name and is not the viewer marker", () => {
    const champion = fixture("match-sample.html").replace(">Dani<", ">Dani<span>, Campeón de Mas Blanco, 1.er semestre 2023</span><");
    const dani = parseMatchPage(champion, MATCH_ID, NOW).pairB[1];
    expect(dani).toMatchObject({ displayName: "Dani", isViewer: false });
  });
  test("the viewer who is also a champion is still recognised", () => {
    const both = fixture("match-sample.html").replace("<span>·tú</span>", "<span>·tú</span><span>, Campeón de Mas Azul, 2022</span>");
    expect(parseMatchPage(both, MATCH_ID, NOW).pairA[1]).toMatchObject({ displayName: "Beto", isViewer: true });
  });
  test("a page without four players fails with the count", () => {
    const three = fixture("match-sample.html").replace(/<li><a data-cta-id="match_to_player_profile" href="\/perfil\/44444444[^]*?<\/li>/, "");
    expect(() => parseMatchPage(three, MATCH_ID, NOW)).toThrow(/expected 4 players, found 3/);
  });
});
