import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, LEVELS, freshDb, seedPlayers } from "./db";

// Team value = sum of players.value over a team's squad. It is computed from tables every signed-in user can already
// read (players, squads), so showing it for every team widens nothing; lineups and bids stay private.

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const TEAM_VALUE = "select s.user_id, coalesce(sum(p.value), 0)::bigint as v from squads s join players p on p.id = s.player_id group by s.user_id order by s.user_id";

let a: string;
let b: string;
beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 8);
  a = await addUser(db);
  b = await addUser(db);
  await asUser(db, a, () => db.query("select create_manager('Alfa')"));
  await asUser(db, b, () => db.query("select create_manager('Beta')"));
});

describe("team value over the existing read policies", () => {
  test("a user sees the same totals for every team that the owner sees for their own", async () => {
    const asA = await asUser(db, a, () => q<{ user_id: string; v: string }>(TEAM_VALUE));
    const asB = await asUser(db, b, () => q<{ user_id: string; v: string }>(TEAM_VALUE));
    expect(asA).toEqual(asB);
    expect(asA).toHaveLength(2);
    const own = await q<{ v: string }>("select sum(p.value)::bigint v from squads s join players p on p.id = s.player_id where s.user_id = $1", [a]);
    expect(asA.find((r) => r.user_id === a)!.v).toBe(own[0].v);
  });

  test("the total counts the whole squad, not only the starters", async () => {
    const all = await q<{ v: string }>("select sum(p.value)::bigint v from squads s join players p on p.id = s.player_id where s.user_id = $1", [a]);
    const starters = await q<{ v: string }>("select sum(p.value)::bigint v from lineups l join players p on p.id = l.player_id where l.user_id = $1", [a]);
    expect(Number(all[0].v)).toBeGreaterThan(Number(starters[0].v));
    expect((await q<{ n: number }>("select count(*)::int n from squads where user_id = $1", [a]))[0].n).toBe(3 * LEVELS);
  });

  test("it follows the market value: a repriced player changes the total, cash budget does not", async () => {
    const before = (await q<{ user_id: string; v: string }>(TEAM_VALUE)).find((r) => r.user_id === a)!.v;
    await db.query("update players set value = value + 10000 where id = (select player_id from squads where user_id = $1 limit 1)", [a]);
    await db.query("update profiles set budget = budget + 999 where user_id = $1", [a]);
    const after = (await q<{ user_id: string; v: string }>(TEAM_VALUE)).find((r) => r.user_id === a)!.v;
    expect(Number(after) - Number(before)).toBe(10000);
  });

  test("a team with no players has no squad rows (the app shows it as 0)", async () => {
    const c = await addUser(db);
    await db.query("insert into profiles (user_id, team_name) values ($1, 'Vacío')", [c]);
    expect((await q(TEAM_VALUE)).find((r: any) => r.user_id === c)).toBeUndefined();
  });

  test("showing it for everyone does not open private data: another team's lineup and bids stay unreadable", async () => {
    await asUser(db, b, async () => {
      expect(await q("select * from lineups where user_id = $1", [a])).toEqual([]);
      expect(await q("select * from bids where user_id = $1", [a])).toEqual([]);
    });
  });

  test("no new table, view or column was added for it: the profile columns are still the reviewed ones", async () => {
    const cols = await q<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' order by 1");
    expect(cols.map((c) => c.column_name)).toEqual(["avatar_url", "budget", "created_at", "is_admin", "team_name", "user_id"]);
  });
});
