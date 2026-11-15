import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, freshDb, seedPlayers } from "./db";

// The daily market opens max(3, registered teams) free players per color, as many as are free.

let db: PGlite;
const DAY1 = "2026-11-14T05:00:00Z"; // 06:00 Madrid
const DAY2 = "2026-11-15T05:00:00Z";
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const close = (now = DAY1) => db.query("select close_cycle(false, $1::timestamptz)", [now]);

async function managers(n: number) {
  for (let i = 0; i < n; i++) {
    const id = await addUser(db);
    await asUser(db, id, () => db.query("select create_manager($1)", [`Equipo ${i + 1}`]));
  }
}
const openPerColor = async () => {
  const rows = await q<{ color: string; n: number }>(
    "select p.color, count(*)::int n from market_listings l join players p on p.id = l.player_id where l.status = 'open' group by 1",
  );
  return COLORS.map((c) => rows.find((r) => r.color === c)?.n ?? 0);
};

describe("how many players the daily market opens per color", () => {
  beforeEach(async () => {
    db = await freshDb();
    await seedPlayers(db, 24); // 5 teams own 15 per color, leaving 9 free
  });

  test.each([[0], [1], [2], [3]])("with %i registered team(s) it opens the minimum of 3 per color", async (teams) => {
    await managers(teams);
    await close();
    expect(await openPerColor()).toEqual(COLORS.map(() => 3));
  });

  test.each([[4], [5]])("with %i teams it opens one per team per color", async (teams) => {
    await managers(teams);
    await close();
    expect(await openPerColor()).toEqual(COLORS.map(() => teams));
  });

  test("a signed-up user with no team yet does not count", async () => {
    await managers(3);
    await addUser(db);
    await close();
    expect(await openPerColor()).toEqual(COLORS.map(() => 3));
  });

  test("it grows from one day to the next as teams register, and never lists an owned player", async () => {
    await managers(3);
    await close(DAY1);
    expect(await openPerColor()).toEqual(COLORS.map(() => 3));

    await managers(2); // two more teams sign up during the day
    expect(await openPerColor()).toEqual(COLORS.map(() => 3)); // today's round is not touched by sign-ups

    await close(DAY2);
    expect(await openPerColor()).toEqual(COLORS.map(() => 5));
    expect(await q("select 1 from market_listings l join squads s on s.player_id = l.player_id where l.status = 'open'")).toEqual([]);
    expect(await q("select player_id from market_listings where status = 'open' group by 1 having count(*) > 1")).toEqual([]);
  });
});

describe("limited to the free players that exist", () => {
  test("opens fewer than the target when a color has too few free players", async () => {
    db = await freshDb();
    await seedPlayers(db, 14); // 4 teams own 12 per color, leaving 2 free
    await managers(4);
    await close();
    // Azul and Blanco share their squad places, so together they have more free players than the other levels.
    expect(await openPerColor()).toEqual([4, 4, ...COLORS.slice(2).map(() => 2)]);
    expect(await q("select 1 from market_listings l join squads s on s.player_id = l.player_id")).toEqual([]);
  });
});

describe("rolling the rule out", () => {
  test("applying the migration leaves the round that is already open exactly as it is", async () => {
    db = await freshDb({ stopBefore: "0005" });
    await seedPlayers(db, 24, COLORS.slice(0, 4)); // the schema before 0009 knows four colors
    await managers(2);
    await close(DAY1); // today's round, opened by the previous rule
    const snapshot = async () => ({
      listings: await q("select id, player_id, status, closes_at from market_listings order by id"),
      cycles: await q("select cycle_date::text, closed_at from cycles order by 1"),
      snapshots: await q("select count(*)::int n from lineup_snapshots"),
      budgets: await q("select user_id, budget from profiles order by user_id"),
    });
    const before = await snapshot();
    expect(before.listings).toHaveLength(12); // 3 per color, four colors

    const migration = readFileSync(new URL("../migrations/0005_market_size.sql", import.meta.url), "utf8");
    await db.exec(migration);
    expect(await snapshot()).toEqual(before);

    await managers(2); // 4 teams now
    await close(DAY2);
    expect((await openPerColor()).slice(0, 4)).toEqual([4, 4, 4, 4]); // the schema at that point has four colors
  });

  test("the helper and close_cycle stay out of reach of the API roles", async () => {
    db = await freshDb();
    expect((await q<{ ok: boolean }>("select to_regprocedure('market_listings_per_color()') is not null as ok"))[0].ok).toBe(true);
    const callable = async (role: string, sql: string) => {
      await db.exec(`set role ${role}`);
      try { await db.query(sql); return true; } catch { return false; } finally { await db.exec("reset role"); }
    };
    for (const role of ["anon", "authenticated"]) {
      expect(await callable(role, "select market_listings_per_color()")).toBe(false);
      expect(await callable(role, "select close_cycle(false, now())")).toBe(false);
    }
  });
});
