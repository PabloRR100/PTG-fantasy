import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMatchPage } from "@/lib/ptg/parse-match";
import { parseRanking } from "@/lib/ptg/parse-ranking";
import {
  buildMatchPayload,
  buildPlayersPayload,
  ingestMatch,
  ingestPlayers,
  type MatchPayload,
  type Rpc,
} from "@/services/ingest";
import { addUser, asUser, freshDb } from "../../supabase/tests/db";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../tests/fixtures/ptg/${name}`, import.meta.url)), "utf8");
const MATCH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const GROUP = "7bdccef6-c5aa-235a-fab5-ecebbae72a48";
const NOW = new Date("2026-11-14T09:00:00Z");

const sampleMatch = () => parseMatchPage(fixture("match-sample.html"), MATCH_ID, NOW);
const sampleRanking = (gender: "male" | "female" = "male") =>
  buildPlayersPayload(parseRanking(fixture("ranking-sample.html")).map((r) => ({ ...r, color: "Blanco" as const, gender, groupId: GROUP })));

/** Calls the real SQL function the way supabase-js .rpc() does: named arguments, jsonb in and out. */
const rpcFor = (db: PGlite): Rpc => async (fn, args) => {
  const names = Object.keys(args);
  const call = `select ${fn}(${names.map((n, i) => `${n} => $${i + 1}::jsonb`).join(", ")}) as result`;
  try {
    const res = await db.query<{ result: unknown }>(call, names.map((n) => JSON.stringify(args[n])));
    return { data: res.rows[0].result, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } };
  }
};

describe("buildMatchPayload", () => {
  test("scores each pair from its own side: pair A lost 1-2, pair B won 2-1", () => {
    const payload = buildMatchPayload(sampleMatch())!;
    const byId = Object.fromEntries(payload.players.map((p) => [p.ptg_player_id.slice(0, 4), p]));
    expect(byId["1111"]).toEqual({ ptg_player_id: expect.any(String), won: false, sets_won: 1, sets_lost: 2, points: 1 });
    expect(byId["2222"]).toMatchObject({ won: false, points: 1 });
    expect(byId["3333"]).toMatchObject({ won: true, sets_won: 2, sets_lost: 1, points: 7 });
    expect(byId["4444"]).toMatchObject({ won: true, points: 7 });
  });
  test("carries the match identity and kickoff through", () => {
    expect(buildMatchPayload(sampleMatch())).toMatchObject({
      ptg_match_id: MATCH_ID,
      played_at: "2026-11-09T19:00:00.000Z",
      club: "Club Ejemplo",
      walkover: false,
    });
  });
  test("a match that is not finished produces nothing", () => {
    const pending = parseMatchPage(fixture("match-sample.html").replace("<em>finalizado</em>", "<em>programado</em>"), MATCH_ID, NOW);
    expect(buildMatchPayload(pending)).toBeNull();
  });
  test("a walkover scores 0 for everyone and counts nobody as a winner", () => {
    const noSets = fixture("match-sample.html").replace(/<div><div><div><div>Set 1.*<\/p><\/div>/s, "");
    const payload = buildMatchPayload(parseMatchPage(noSets, MATCH_ID, NOW))!;
    expect(payload.walkover).toBe(true);
    expect(payload.players.every((p) => p.points === 0 && !p.won && p.sets_won === 0)).toBe(true);
  });
});

describe("buildPlayersPayload", () => {
  test("prices a player from color, ratio and matches played", () => {
    expect(sampleRanking()[0]).toMatchObject({ display_name: "Ana Mora", color: "Blanco", group_id: GROUP, gender: "male", value: 2_600_000 });
  });
  test("carries the gender of the group the player was read in", () => {
    expect(sampleRanking("female").every((p) => p.gender === "female")).toBe(true);
  });
});

describe("ingest into Postgres", () => {
  let db: PGlite;
  let rpc: Rpc;
  beforeEach(async () => {
    db = await freshDb();
    rpc = rpcFor(db);
  });
  const count = async (table: string) => ((await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0].n);

  test("players: running twice leaves the same rows and keeps the first value", async () => {
    await ingestPlayers(rpc, sampleRanking());
    const repriced = sampleRanking().map((p) => ({ ...p, ratio: 0.1, value: 1 }));
    await ingestPlayers(rpc, repriced);
    expect(await count("players")).toBe(3);
    const ana = (await db.query<{ ratio: string; value: number }>("select ratio, value from players where display_name = 'Ana Mora'")).rows[0];
    expect(Number(ana.ratio)).toBe(0.1); // refreshed
    expect(ana.value).toBe(2_600_000); // set once
  });

  test("a player who moves color and gender keeps his row; the value is not repriced", async () => {
    await ingestPlayers(rpc, sampleRanking());
    const moved = sampleRanking("female").map((p) => ({ ...p, color: "Azul" as const, value: 1 }));
    await ingestPlayers(rpc, moved);
    expect(await count("players")).toBe(3);
    const ana = (await db.query<{ color: string; gender: string; value: number }>("select color, gender, value from players where display_name = 'Ana Mora'")).rows[0];
    expect(ana).toEqual({ color: "Azul", gender: "female", value: 2_600_000 });
  });

  test("two players with the same name but different ids stay two players", async () => {
    const [ana] = sampleRanking();
    await ingestPlayers(rpc, [ana, { ...ana, ptg_player_id: "99999999-9999-4999-8999-999999999999" }]);
    expect(await count("players")).toBe(2);
  });

  test("a match scraped twice stays one match with one row per player", async () => {
    await ingestPlayers(rpc, sampleRanking());
    const match = buildMatchPayload(sampleMatch())!;
    await ingestMatch(rpc, match);
    await ingestMatch(rpc, match);
    expect(await count("ptg_matches")).toBe(1);
    expect(await count("match_players")).toBe(3); // Dani is not in the ranking sample
    const total = (await db.query<{ t: number }>("select sum(points)::int t from match_players")).rows[0].t;
    expect(total).toBe(1 + 1 + 7); // Ana, Beto, Carla: points are not doubled
  });

  test("players the game does not know are skipped and counted, never silently dropped", async () => {
    await ingestPlayers(rpc, sampleRanking());
    expect(await ingestMatch(rpc, buildMatchPayload(sampleMatch())!)).toEqual({ inserted: 3, skipped: 1 });
  });

  test("a corrected score replaces the earlier one", async () => {
    await ingestPlayers(rpc, sampleRanking());
    const match = buildMatchPayload(sampleMatch())!;
    await ingestMatch(rpc, match);
    const corrected: MatchPayload = { ...match, players: match.players.map((p) => ({ ...p, points: 5 })) };
    await ingestMatch(rpc, corrected);
    expect((await db.query<{ p: number }>("select max(points)::int p from match_players")).rows[0].p).toBe(5);
  });

  test("a rejected call throws with the function name and the database message", async () => {
    const broken = { ...buildMatchPayload(sampleMatch())!, played_at: "not a date" };
    await expect(ingestMatch(rpc, broken)).rejects.toThrow(/ingest_match.*aaaaaaaa/);
  });

  test("only the service role can run the ingest functions", async () => {
    const user = await addUser(db);
    await expect(asUser(db, user, () => db.query("select ingest_players('[]'::jsonb)"))).rejects.toThrow(/permission denied/);
    await db.exec("set role anon");
    await expect(db.query("select ingest_match('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role");
    await expect(db.query("select ingest_players('[]'::jsonb)")).resolves.toBeDefined();
    await db.exec("reset role");
  });
});
