import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, LEVELS, freshDb, seedPlayers } from "./db";

// What the Jugadores page reads: players, squads (owner ids) and profiles (team names). It renders only
// profiles.team_name; these tests pin what the API lets a signed-in user, and a visitor, read.

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 8);
  const user = await addUser(db);
  await asUser(db, user, () => db.query("select create_manager('Los Pepros')"));
});

describe("read access", () => {
  test("a signed-in user reads every player, owner link and team name", async () => {
    const other = await addUser(db);
    const rows = await asUser(db, other, async () => ({
      players: (await q<{ n: number }>("select count(*)::int n from players"))[0].n,
      squads: (await q<{ n: number }>("select count(*)::int n from squads"))[0].n,
      teams: await q<{ team_name: string }>("select team_name from profiles"),
    }));
    expect(rows.players).toBe(8 * COLORS.length);
    expect(rows.squads).toBe(3 * LEVELS);
    expect(rows.teams).toEqual([{ team_name: "Los Pepros" }]);
  });

  test.each(["players", "squads", "profiles", "market_listings", "lineups", "bids"])(
    "a visitor with no session reads nothing from %s",
    async (table) => {
      await db.exec("set role anon");
      try {
        const rows = await db.query(`select * from ${table}`).then((r) => r.rows, () => "denied");
        expect(rows === "denied" || (rows as unknown[]).length === 0).toBe(true);
      } finally {
        await db.exec("reset role");
      }
    },
  );

  test("an account's email and other contact data live outside the readable tables", async () => {
    const cols = await q<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and column_name ~* '(mail|phone|token|password|secret)'`,
    );
    expect(cols).toEqual([]);
  });

  test("the columns of profiles are exactly the ones reviewed (a new one must be reviewed before it ships)", async () => {
    const cols = await q<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' order by column_name",
    );
    expect(cols.map((c) => c.column_name)).toEqual(["avatar_url", "budget", "created_at", "is_admin", "team_name", "user_id"]);
  });

  test("a signed-in user cannot change team names, owners or values by writing the tables directly", async () => {
    const intruder = await addUser(db);
    const before = {
      teams: await q("select user_id, team_name from profiles order by user_id"),
      squads: await q("select player_id, user_id from squads order by player_id"),
      values: await q("select id, value from players order by id"),
    };
    await asUser(db, intruder, async () => {
      for (const sql of [
        "update profiles set team_name = 'Hacked'",
        "delete from squads",
        "update squads set user_id = auth.uid()",
        "update players set value = 1",
      ]) {
        await db.query(sql).catch(() => undefined); // an error and a silent no-op both leave the data alone
      }
    });
    expect({
      teams: await q("select user_id, team_name from profiles order by user_id"),
      squads: await q("select player_id, user_id from squads order by player_id"),
      values: await q("select id, value from players order by id"),
    }).toEqual(before);
  });
});
