import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, LEVELS, freshDb, seedPlayers } from "./db";

let db: PGlite;
beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 8);
});

const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const createManager = (user: string, team = "Los Pablos") =>
  asUser(db, user, () => db.query("select create_manager($1)", [team]));

describe("create_manager", () => {
  test("gives a profile with the starting budget, 3 players and 2 starters of every level (Azul and Blanco count as one)", async () => {
    const user = await addUser(db);
    await createManager(user);

    expect(await rows("select budget from profiles where user_id = $1", [user])).toEqual([{ budget: 5_000_000 }]);
    const perLevel = (table: string, key: string) =>
      rows<{ level: string; n: number }>(
        `select gc.group_name as level, count(*)::int n from ${table} t join players p on p.id = t.player_id join game_colors gc on gc.name = p.color where t.user_id = $1 group by 1`,
        [user],
      );
    const squad = await perLevel("squads", "player_id");
    expect(squad).toHaveLength(LEVELS);
    expect(squad.every((r) => r.n === 3)).toBe(true);
    const lineup = await perLevel("lineups", "player_id");
    expect(lineup).toHaveLength(LEVELS);
    expect(lineup.every((r) => r.n === 2)).toBe(true);
  });

  test("starts the two most valuable players of each color", async () => {
    const user = await addUser(db);
    await createManager(user);
    const outsiders = await rows(
      `select 1 from lineups l join players p on p.id = l.player_id
       where l.user_id = $1 and exists (
         select 1 from squads s join players q on q.id = s.player_id
         where s.user_id = $1 and q.color = p.color and q.value > p.value and q.id not in
           (select player_id from lineups where user_id = $1))`,
      [user],
    );
    expect(outsiders).toEqual([]);
  });

  test("two managers never share a player", async () => {
    await createManager(await addUser(db), "Uno");
    await createManager(await addUser(db), "Dos");
    expect(await rows("select count(*)::int n, count(distinct player_id)::int d from squads")).toEqual([{ n: 6 * LEVELS, d: 6 * LEVELS }]);
  });

  test("with too few free players it fails with the reason and leaves nothing behind", async () => {
    db = await freshDb();
    await seedPlayers(db, 5);
    await createManager(await addUser(db), "Uno");
    const second = await addUser(db);
    await expect(createManager(second, "Dos")).rejects.toThrow(/not enough free players/);
    expect(await rows("select 1 from profiles where user_id = $1", [second])).toEqual([]);
  });

  test("a user cannot create a second team", async () => {
    const user = await addUser(db);
    await createManager(user);
    await expect(createManager(user, "Otra")).rejects.toThrow(/already has a team/);
  });

  test("a caller with no session is rejected", async () => {
    await expect(db.query("select create_manager('x')")).rejects.toThrow(/not signed in/);
  });
});

describe("set_lineup", () => {
  async function managerWithSquad() {
    const user = await addUser(db);
    await createManager(user);
    const squad = await rows<{ id: string; color: string }>(
      "select p.id, p.color from squads s join players p on p.id = s.player_id where s.user_id = $1 order by p.value desc",
      [user],
    );
    return { user, squad };
  }
  const setLineup = (user: string, ids: string[]) => asUser(db, user, () => db.query("select set_lineup($1::uuid[])", [ids]));

  test("replaces the lineup with another valid 2-per-color choice", async () => {
    const { user, squad } = await managerWithSquad();
    const levelOf = (color: string) => (color === "Blanco" || color === "Azul" ? "Azul y Blanco" : color);
    const worst = [...new Set(COLORS.map(levelOf))].flatMap((level) => squad.filter((p) => levelOf(p.color) === level).slice(-2).map((p) => p.id));
    await setLineup(user, worst);
    const now = await rows<{ player_id: string }>("select player_id from lineups where user_id = $1", [user]);
    expect(now.map((r) => r.player_id).sort()).toEqual([...worst].sort());
  });

  test("rejects a lineup that is not 2 per color", async () => {
    const { user, squad } = await managerWithSquad();
    const threeRosa = [...squad.filter((p) => p.color === "Rosa").map((p) => p.id), ...squad.filter((p) => p.color !== "Rosa").slice(0, 15).map((p) => p.id)];
    await expect(setLineup(user, threeRosa)).rejects.toThrow(/2 players per color/);
  });

  test("rejects a player the user does not own", async () => {
    const { user, squad } = await managerWithSquad();
    const other = await addUser(db);
    await createManager(other, "Otro");
    const foreign = (await rows<{ player_id: string }>("select player_id from squads where user_id = $1 limit 1", [other]))[0].player_id;
    const ids = [...COLORS.flatMap((c) => squad.filter((p) => p.color === c).slice(0, 2).map((p) => p.id))];
    ids[0] = foreign;
    await expect(setLineup(user, ids)).rejects.toThrow(/not in your squad/);
  });
});

describe("row level security", () => {
  test("a user sees only their own lineup and bids", async () => {
    const a = await addUser(db);
    const b = await addUser(db);
    await createManager(a, "Equipo A");
    await createManager(b, "Equipo B");
    const player = (await rows<{ id: string }>("select id from players where id not in (select player_id from squads) limit 1"))[0].id;
    const listing = (await rows<{ id: string }>(
      "insert into market_listings (player_id, closes_at) values ($1, now() + interval '1 day') returning id",
      [player],
    ))[0].id;
    await db.query("insert into bids (listing_id, user_id, amount) values ($1, $2, 100000)", [listing, a]);

    expect(await asUser(db, b, async () => (await db.query("select * from bids")).rows)).toEqual([]);
    expect((await asUser(db, a, async () => (await db.query("select * from bids")).rows)).length).toBe(1);
    const lineupOwners = await asUser(db, b, async () => (await db.query<{ user_id: string }>("select distinct user_id from lineups")).rows);
    expect(lineupOwners).toEqual([{ user_id: b }]);
  });

  test("a user cannot write ownership directly", async () => {
    const user = await addUser(db);
    await createManager(user);
    const free = (await rows<{ id: string }>("select id from players where id not in (select player_id from squads) limit 1"))[0].id;
    await expect(asUser(db, user, () => db.query("insert into squads (player_id, user_id) values ($1, $2)", [free, user]))).rejects.toThrow(/row-level security|permission denied/);
  });

  test("everyone can read players and standings inputs", async () => {
    const user = await addUser(db);
    await createManager(user);
    const seen = await asUser(db, user, async () => (await db.query<{ n: number }>("select count(*)::int n from players")).rows[0].n);
    expect(seen).toBe(8 * COLORS.length);
  });
});
