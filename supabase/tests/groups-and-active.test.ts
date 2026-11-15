import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, freshDb, seedPlayers } from "./db";

// 0012: Azul and Blanco are one level for squads and lineups; players absent from the rankings are inactive.

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
async function manager(name: string) {
  const id = await addUser(db);
  await asUser(db, id, () => db.query("select create_manager($1)", [name]));
  return id;
}
const perLevel = (table: "squads" | "lineups", user: string) =>
  q<{ level: string; n: number }>(`select gc.group_name as level, count(*)::int n from ${table} t join players p on p.id = t.player_id join game_colors gc on gc.name = p.color where t.user_id = $1 group by 1 order by 1`, [user]);

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 12);
});

describe("Azul and Blanco as one level", () => {
  test("the level table says so, and every other color is its own level", async () => {
    const rows = await q<{ name: string; group_name: string }>("select name, group_name from game_colors order by position");
    expect(rows.filter((r) => r.group_name === "Azul y Blanco").map((r) => r.name)).toEqual(["Blanco", "Azul"]);
    expect(new Set(rows.map((r) => r.group_name)).size).toBe(9);
    expect(rows).toHaveLength(COLORS.length);
  });

  test("a new team holds 3 of the combined level, however they split between Azul and Blanco", async () => {
    const user = await manager("Alfa");
    const levels = await perLevel("squads", user);
    expect(levels.find((l) => l.level === "Azul y Blanco")!.n).toBe(3);
    expect((await perLevel("lineups", user)).find((l) => l.level === "Azul y Blanco")!.n).toBe(2);
  });

  test("a lineup may start 2 Blancos, 1+1, or 2 Azules: only the level count matters", async () => {
    const user = await manager("Alfa");
    await db.query("delete from lineups where user_id = $1", [user]);
    await db.query("delete from squads where user_id = $1 and player_id in (select id from players where color in ('Azul', 'Blanco'))", [user]);
    const extra = await q<{ id: string }>("select id from players where color = 'Azul' and id not in (select player_id from squads) limit 3");
    for (const e of extra) await db.query("insert into squads (player_id, user_id) values ($1, $2)", [e.id, user]);
    const squad = await q<{ player_id: string; color: string }>("select s.player_id, p.color from squads s join players p on p.id = s.player_id where s.user_id = $1", [user]);
    const others = [...new Set(COLORS.filter((c) => c !== "Azul" && c !== "Blanco"))];
    const starters = [
      ...extra.slice(0, 2).map((e) => e.id),
      ...others.flatMap((c) => squad.filter((p) => p.color === c).slice(0, 2).map((p) => p.player_id)),
    ];
    await asUser(db, user, () => db.query("select set_lineup($1::uuid[])", [starters]));
    expect(await q("select 1 from lineups where user_id = $1", [user])).toHaveLength(18);
  });

  test("selling keeps 2 in the combined level, not 2 of each color", async () => {
    const user = await manager("Alfa");
    const members = await q<{ id: string }>("select p.id from squads s join players p on p.id = s.player_id where s.user_id = $1 and p.color in ('Azul', 'Blanco') order by (p.id in (select player_id from lineups where user_id = $1)), p.id", [user]);
    expect(members).toHaveLength(3);
    await asUser(db, user, () => db.query("select sell_player($1)", [members[0].id])); // 3 -> 2: allowed
    await asUser(db, user, async () => {
      await expect(db.query("select sell_player($1)", [members[1].id])).rejects.toThrow(/at least 2 players/);
    });
  });

  test("the market still lists per color, so Blanco and Azul each get their own listings", async () => {
    await db.query("select open_market_listings()");
    const rows = await q<{ color: string; n: number }>("select p.color, count(*)::int n from market_listings l join players p on p.id = l.player_id where l.status = 'open' group by 1");
    expect(rows.find((r) => r.color === "Azul")!.n).toBe(3);
    expect(rows.find((r) => r.color === "Blanco")!.n).toBe(3);
  });
});

describe("inactive players", () => {
  const present = async () => (await q<{ ptg_player_id: string }>("select ptg_player_id from players where color <> 'Naranja' or id in (select id from players where color = 'Naranja' order by id limit 6)")).map((r) => r.ptg_player_id);

  test("a player outside the present list is deactivated, leaves squads, lineups and listings, and keeps his rows", async () => {
    const user = await manager("Alfa");
    await db.query("select open_market_listings()");
    const [gone] = await q<{ id: string; ptg_player_id: string }>("select p.id, p.ptg_player_id from squads s join players p on p.id = s.player_id where s.user_id = $1 and p.color = 'Naranja'", [user]);
    const listed = await q<{ id: string }>("select p.id from market_listings l join players p on p.id = l.player_id where l.status = 'open' and p.color = 'Naranja' limit 1");
    const keep = (await present()).filter((x) => x !== gone.ptg_player_id);
    const lonely = listed.length ? (await q<{ ptg_player_id: string }>("select ptg_player_id from players where id = $1", [listed[0].id]))[0].ptg_player_id : null;
    const [{ r }] = await q<{ r: { deactivated: number; squad_places_freed: number } }>("select deactivate_absent_players($1::uuid[]) r", [keep.filter((x) => x !== lonely)]);
    expect(r.deactivated).toBeGreaterThanOrEqual(1);
    expect(await q("select 1 from players where id = $1", [gone.id])).toHaveLength(1); // not deleted
    expect((await q<{ active: boolean }>("select active from players where id = $1", [gone.id]))[0].active).toBe(false);
    expect(await q("select 1 from squads where player_id = $1", [gone.id])).toEqual([]);
    expect(await q("select 1 from lineups where player_id = $1", [gone.id])).toEqual([]);
    expect(await q("select 1 from market_listings where status = 'open' and player_id in (select id from players where not active)")).toEqual([]);
  });

  test("the team is topped up by the draw, with active players only, and keeps a valid lineup", async () => {
    const user = await manager("Alfa");
    const [gone] = await q<{ ptg_player_id: string }>("select p.ptg_player_id from squads s join players p on p.id = s.player_id where s.user_id = $1 and p.color = 'Naranja'", [user]);
    await db.query("select deactivate_absent_players($1::uuid[])", [(await present()).filter((x) => x !== gone.ptg_player_id)]);
    expect((await perLevel("squads", user)).every((l) => l.n >= 3)).toBe(true);
    expect((await perLevel("lineups", user)).every((l) => l.n === 2)).toBe(true);
    expect(await q("select 1 from squads s join players p on p.id = s.player_id where not p.active")).toEqual([]);
  });

  test("it refuses a list that is clearly not a full scrape", async () => {
    await manager("Alfa");
    await expect(db.query("select deactivate_absent_players('{}'::uuid[])")).rejects.toThrow(/not a full ranking scrape/);
    expect(await q("select 1 from players where not active")).toEqual([]);
  });

  test("an inactive player is never drawn, listed or given to a new team", async () => {
    await db.query("update players set active = false where color = 'Oro' and id in (select id from players where color = 'Oro' order by id limit 11)"); // 1 Oro left
    await db.query("select open_market_listings()");
    expect(await q("select 1 from market_listings l join players p on p.id = l.player_id where not p.active")).toEqual([]);
    await expect(manager("Alfa")).rejects.toThrow(/not enough free players/); // needs 3 Oro, only 1 is active
  });

  test("loading a player again reactivates him, with his history intact", async () => {
    const [p] = await q<{ ptg_player_id: string }>("select ptg_player_id from players limit 1");
    await db.query("update players set active = false where ptg_player_id = $1", [p.ptg_player_id]);
    await db.query("select ingest_players($1::jsonb)", [JSON.stringify([{ ptg_player_id: p.ptg_player_id, display_name: "Back", color: "Rosa", group_id: "00000000-0000-4000-8000-000000000001", matches_played: 1, ratio: 0.5, value: 1 }])]);
    expect((await q<{ active: boolean }>("select active from players where ptg_player_id = $1", [p.ptg_player_id]))[0].active).toBe(true);
  });

  test("only the scraper's role may call it", async () => {
    const user = await manager("Alfa");
    await asUser(db, user, async () => {
      await expect(db.query("select deactivate_absent_players('{}'::uuid[])")).rejects.toThrow(/permission denied/);
    });
  });
});
