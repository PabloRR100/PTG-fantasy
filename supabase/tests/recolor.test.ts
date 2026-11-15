import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, LEVELS, freshDb, seedPlayers } from "./db";

// A player's color follows the current semester's ranking, even when a manager owns him.

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function manager(name = "Equipo") {
  const id = await addUser(db);
  await asUser(db, id, () => db.query("select create_manager($1)", [name]));
  return id;
}
const lineup = (user: string) =>
  q<{ level: string; n: number }>(
    "select gc.group_name as level, count(*)::int n from lineups l join players p on p.id = l.player_id join game_colors gc on gc.name = p.color where l.user_id = $1 group by 1 order by 1",
    [user],
  );
const lineupSize = async (user: string) => (await q<{ n: number }>("select count(*)::int n from lineups where user_id = $1", [user]))[0].n;
const starterOf = async (user: string, color: string) =>
  (await q<{ ptg_player_id: string; id: string }>(
    "select p.ptg_player_id, p.id from lineups l join players p on p.id = l.player_id where l.user_id = $1 and p.color = $2 order by p.value desc limit 1",
    [user, color],
  ))[0];
const move = (ptg: string, color: string, extra: Record<string, unknown> = {}) =>
  db.query("select ingest_players($1::jsonb)", [
    JSON.stringify([{ ptg_player_id: ptg, display_name: "Moved", color, group_id: "00000000-0000-4000-8000-000000000001", matches_played: 0, ratio: 0, value: 1, ...extra }]),
  ]);

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 8);
});

describe("ingest_players with a color change", () => {
  test("keeps the same row: no duplicate, squad and value intact", async () => {
    const user = await manager();
    const { ptg_player_id, id } = await starterOf(user, "Rosa");
    const [before] = await q<{ value: number }>("select value from players where id = $1", [id]);
    await move(ptg_player_id, "Verde");
    expect(await q("select 1 from players where ptg_player_id = $1", [ptg_player_id])).toHaveLength(1);
    const [after] = await q<{ id: string; color: string; value: number }>("select id, color, value from players where ptg_player_id = $1", [ptg_player_id]);
    expect(after).toEqual({ id, color: "Verde", value: before.value }); // value is set once, never rewritten
    expect(await q("select 1 from squads where player_id = $1 and user_id = $2", [id, user])).toHaveLength(1);
  });

  test("a starter who changes color leaves a lineup of 2 per color, filled from the same squad", async () => {
    const user = await manager();
    const { ptg_player_id } = await starterOf(user, "Rosa");
    const squadBefore = await q("select player_id from squads where user_id = $1 order by 1", [user]);
    await move(ptg_player_id, "Verde");
    const levels = await lineup(user);
    expect(levels).toHaveLength(LEVELS);
    expect(levels.every((l) => l.n === 2)).toBe(true);
    // The recolored player stays a starter (Verde now has 4 in the squad: the 2 best starters stay), nobody outside the squad enters.
    const squadAfter = await q("select player_id from squads where user_id = $1 order by 1", [user]);
    expect(squadAfter).toEqual(squadBefore);
    expect(await q("select 1 from lineups l where l.user_id = $1 and l.player_id not in (select player_id from squads where user_id = $1)", [user])).toHaveLength(0);
  });

  test("a manager whose lineup stays valid is not touched", async () => {
    const user = await manager();
    const before = await q("select player_id from lineups where user_id = $1 order by 1", [user]);
    const bench = await q<{ ptg_player_id: string }>(
      "select p.ptg_player_id from squads s join players p on p.id = s.player_id where s.user_id = $1 and s.player_id not in (select player_id from lineups where user_id = $1) limit 1",
      [user],
    );
    const [{ color }] = await q<{ color: string }>("select color from players where ptg_player_id = $1", [bench[0].ptg_player_id]);
    await move(bench[0].ptg_player_id, color === "Oro" ? "Plata" : "Oro"); // a benched player moves: lineup unchanged
    expect(await q("select player_id from lineups where user_id = $1 order by 1", [user])).toEqual(before);
  });

  test("a squad with fewer than 2 of a color cannot field a valid lineup: it is kept and reported", async () => {
    const user = await manager();
    await asUser(db, user, async () => {
      const [{ id }] = await q<{ id: string }>("select p.id from squads s join players p on p.id = s.player_id where s.user_id = $1 and p.color = 'Rosa' and s.player_id not in (select player_id from lineups where user_id = $1)", [user]);
      await db.query("select sell_player($1)", [id]); // 3 Rosa -> 2, both starters
    });
    const { ptg_player_id } = await starterOf(user, "Rosa");
    await move(ptg_player_id, "Verde"); // Rosa squad: 1
    expect(await lineupSize(user)).toBe(2 * LEVELS); // unchanged: nothing valid to rebuild
    const [{ r }] = await q<{ r: { repaired: number; impossible: number } }>("select repair_lineups() r");
    expect(r).toEqual({ repaired: 0, impossible: 1 });
  });

  test("ingesting the same payload twice changes nothing", async () => {
    const user = await manager();
    const { ptg_player_id } = await starterOf(user, "Rosa");
    await move(ptg_player_id, "Oro");
    const first = await q("select player_id from lineups where user_id = $1 order by 1", [user]);
    await move(ptg_player_id, "Oro");
    expect(await q("select player_id from lineups where user_id = $1 order by 1", [user])).toEqual(first);
    const [{ r }] = await q<{ r: { repaired: number } }>("select repair_lineups() r");
    expect(r.repaired).toBe(0);
  });
});

describe("gender", () => {
  test("defaults to male, and a payload without gender keeps working (the scraper before this migration)", async () => {
    await move("11111111-1111-4111-8111-111111111111", "Azul");
    expect((await q<{ gender: string }>("select gender from players where ptg_player_id = '11111111-1111-4111-8111-111111111111'"))[0].gender).toBe("male");
  });

  test("stores female and refreshes it on a later run", async () => {
    await move("22222222-2222-4222-8222-222222222222", "Azul", { gender: "female" });
    expect((await q<{ gender: string }>("select gender from players where ptg_player_id = '22222222-2222-4222-8222-222222222222'"))[0].gender).toBe("female");
  });

  test("rejects any other value", async () => {
    await expect(move("33333333-3333-4333-8333-333333333333", "Azul", { gender: "x" })).rejects.toThrow(/gender/);
  });
});

describe("who may call it", () => {
  test("signed-in users cannot ingest or repair", async () => {
    const user = await addUser(db);
    await asUser(db, user, async () => {
      await expect(db.query("select repair_lineups()")).rejects.toThrow(/permission denied/);
      await expect(db.query("select ingest_players('[]'::jsonb)")).rejects.toThrow(/permission denied/);
    });
  });
});
