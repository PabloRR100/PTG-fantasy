import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, freshDb, seedPlayers } from "./db";

// The rules (3 per color in the squad, 2 starters per color) hold for every one of the ten colors, and teams that
// existed with four colors are topped up by a draw when the other six arrive.

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const FOUR = COLORS.slice(0, 4);
const NEW = COLORS.slice(4);

const squadPerColor = (user: string) =>
  q<{ color: string; n: number }>("select p.color, count(*)::int n from squads s join players p on p.id = s.player_id where s.user_id = $1 group by 1", [user]);
const lineupPerColor = (user: string) =>
  q<{ color: string; n: number }>("select p.color, count(*)::int n from lineups l join players p on p.id = l.player_id where l.user_id = $1 group by 1", [user]);
const ids = async (sql: string, params: unknown[] = []) => (await q<{ player_id: string }>(sql, params)).map((r) => r.player_id).sort();

describe("a new team with ten colors", () => {
  beforeEach(async () => {
    db = await freshDb();
    await seedPlayers(db, 8);
  });

  test("gets 3 players and 2 starters of every level (Azul and Blanco are one level since 0012)", async () => {
    const user = await addUser(db);
    await asUser(db, user, () => db.query("select create_manager('Alfa')"));
    const perLevel = (table: string) => q<{ n: number }>(`select count(*)::int n from ${table} t join players p on p.id = t.player_id join game_colors gc on gc.name = p.color where t.user_id = $1 group by gc.group_name`, [user]);
    expect((await perLevel("squads")).map((r) => r.n)).toEqual(Array(9).fill(3));
    expect((await perLevel("lineups")).map((r) => r.n)).toEqual(Array(9).fill(2));
  });

  test("set_lineup wants 18 starters, 2 per level", async () => {
    const user = await addUser(db);
    await asUser(db, user, () => db.query("select create_manager('Alfa')"));
    const mine = await ids("select player_id from squads where user_id = $1", [user]);
    await asUser(db, user, async () => {
      await expect(db.query("select set_lineup($1::uuid[])", [mine.slice(0, 8)])).rejects.toThrow(/2 players per color \(18 in total\)/);
      const valid = await ids("select s.player_id from squads s join players p on p.id = s.player_id join lineups l on l.player_id = s.player_id and l.user_id = s.user_id where s.user_id = $1", [user]);
      await db.query("select set_lineup($1::uuid[])", [valid]);
    });
  });

  test("a color that is not one of the ten cannot exist", async () => {
    await expect(
      db.query("insert into players (ptg_player_id, display_name, color, group_id, value) values (gen_random_uuid(), 'X', 'Turquesa', gen_random_uuid(), 1)"),
    ).rejects.toThrow(/players_color_fkey|violates foreign key/);
  });

  test("the color table is readable by signed-in users and by nobody else", async () => {
    const user = await addUser(db);
    expect(await asUser(db, user, () => q("select name from game_colors"))).toHaveLength(10);
    await db.exec("set role anon");
    try {
      const r = await db.query("select * from game_colors").then((x) => x.rows, () => "denied");
      expect(r === "denied" || (r as unknown[]).length === 0).toBe(true);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("teams that existed with four colors", () => {
  let teams: string[];
  beforeEach(async () => {
    db = await freshDb({ stopBefore: "0009" });
    await seedPlayers(db, 10, FOUR);
    teams = [];
    for (const name of ["Alfa", "Beta"]) {
      const user = await addUser(db);
      await asUser(db, user, () => db.query("select create_manager($1)", [name]));
      teams.push(user);
    }
    await db.exec(readFileSync(new URL("../migrations/0009_ten_colors.sql", import.meta.url), "utf8"));
    await seedPlayers(db, 10, NEW); // the six new colors arrive as free players
  });

  test("before the draw their squad and lineup are the old ones", async () => {
    expect((await squadPerColor(teams[0])).length).toBe(4);
    expect((await lineupPerColor(teams[0])).length).toBe(4);
  });

  test("the draw adds 3 free players of each new color to every team and rebuilds a 20-starter lineup", async () => {
    const before = await Promise.all(teams.map((t) => ids("select player_id from squads where user_id = $1", [t])));
    const [{ r }] = await q<{ r: { added: number; short: number } }>("select draw_missing_players() r");
    expect(r).toEqual({ added: 2 * 3 * NEW.length, short: 0 });
    for (const [i, user] of teams.entries()) {
      const now = await ids("select player_id from squads where user_id = $1", [user]);
      expect(now).toEqual(expect.arrayContaining(before[i])); // nobody loses a player
      expect((await squadPerColor(user)).map((x) => x.n)).toEqual(COLORS.map(() => 3));
      expect((await lineupPerColor(user)).map((x) => x.n)).toEqual(COLORS.map(() => 2));
    }
  });

  test("the old starters stay starters", async () => {
    const startersBefore = await ids("select player_id from lineups where user_id = $1", [teams[0]]);
    await db.query("select draw_missing_players()");
    const startersAfter = await ids("select player_id from lineups where user_id = $1", [teams[0]]);
    expect(startersAfter).toEqual(expect.arrayContaining(startersBefore));
  });

  test("two teams never get the same player, and a player with an open listing is not drawn", async () => {
    const [{ id }] = await q<{ id: string }>("select id from players where color = 'Oro' limit 1");
    await db.query("insert into market_listings (player_id, closes_at) values ($1, now() + interval '1 day')", [id]);
    await db.query("select draw_missing_players()");
    expect(await q("select player_id from squads group by 1 having count(*) > 1")).toEqual([]);
    expect(await q("select 1 from squads where player_id = $1", [id])).toEqual([]);
  });

  test("running it again adds nothing", async () => {
    await db.query("select draw_missing_players()");
    const [{ r }] = await q<{ r: { added: number } }>("select draw_missing_players() r");
    expect(r.added).toBe(0);
  });

  test("a color with too few free players is reported, not guessed", async () => {
    await db.query("delete from players where color = 'Naranja' and id in (select id from players where color = 'Naranja' limit 8)"); // 2 left for 2 teams that need 6
    const [{ r }] = await q<{ r: { short: number } }>("select draw_missing_players() r");
    expect(r.short).toBeGreaterThan(0);
  });

  test("a team that lost a color to a recolor is topped up in that color too", async () => {
    const [{ id, ptg_player_id }] = await q<{ id: string; ptg_player_id: string }>(
      "select p.id, p.ptg_player_id from squads s join players p on p.id = s.player_id where s.user_id = $1 and p.color = 'Rosa' limit 1", [teams[0]]);
    await db.query("update players set color = 'Oro' where id = $1", [id]);
    await db.query("select draw_missing_players()");
    expect((await squadPerColor(teams[0])).find((r) => r.color === "Rosa")!.n).toBeGreaterThanOrEqual(3);
    expect(ptg_player_id).toBeTruthy();
  });

  test("only the scraper's role may call it", async () => {
    await asUser(db, teams[0], async () => {
      await expect(db.query("select draw_missing_players()")).rejects.toThrow(/permission denied/);
    });
  });
});
