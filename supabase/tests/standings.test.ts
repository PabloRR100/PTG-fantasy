import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { cycleDateFor } from "@/services/cycles";
import { addUser, asUser, freshDb, seedPlayers } from "./db";

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 8);
});

describe("cycle_date_of agrees with the TypeScript cycleDateFor", () => {
  test("around both DST changes, every boundary and a spread of instants across a year", async () => {
    const edges = [
      "2026-10-25T04:59:00Z", "2026-10-25T05:00:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z",
      "2027-03-28T03:59:00Z", "2027-03-28T04:00:00Z", "2027-03-28T00:59:00Z", "2027-03-28T01:00:00Z",
      "2026-11-14T04:59:00Z", "2026-11-14T05:00:00Z", "2026-07-01T03:59:00Z", "2026-07-01T04:00:00Z",
    ];
    const spread = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 21 * 60 * 60 * 1000 + i * 137_000).toISOString());
    const instants = [...edges, ...spread];
    const sql = await q<{ t: string; d: string }>(
      "select t, cycle_date_of(t::timestamptz)::text as d from unnest($1::text[]) as t",
      [instants],
    );
    const mismatches = sql.filter((r) => r.d !== cycleDateFor(new Date(r.t)));
    expect(mismatches).toEqual([]);
    expect(sql).toHaveLength(instants.length);
  });
});

describe("manager_cycle_points", () => {
  async function setup() {
    const user = await addUser(db);
    await asUser(db, user, () => db.query("select create_manager('Equipo A')"));
    await db.query("select close_cycle(false, '2026-11-14T05:00:00Z')"); // snapshot for cycle 2026-11-14
    const [starter, bench] = await Promise.all([
      q<{ id: string }>("select player_id id from lineups where user_id = $1 limit 1", [user]).then((r) => r[0].id),
      q<{ id: string }>(
        "select s.player_id id from squads s where s.user_id = $1 and s.player_id not in (select player_id from lineups where user_id = $1) limit 1",
        [user],
      ).then((r) => r[0].id),
    ]);
    return { user, starter, bench };
  }
  const play = async (at: string, player: string, points: number) => {
    const match = (await q<{ id: string }>(
      "insert into ptg_matches (ptg_match_id, played_at, club) values (gen_random_uuid(), $1, 'Club') returning id", [at],
    ))[0].id;
    await db.query("insert into match_players (match_id, player_id, won, sets_won, sets_lost, points) values ($1, $2, true, 2, 0, $3)", [match, player, points]);
  };

  test("counts a starter's matches in the cycle of the snapshot, from 06:00 to 05:59 Madrid", async () => {
    const { user, starter } = await setup();
    await play("2026-11-14T10:00:00Z", starter, 7); // inside the cycle
    await play("2026-11-15T04:59:00Z", starter, 3); // 05:59 Madrid the next day: still the cycle
    await play("2026-11-14T04:59:00Z", starter, 50); // 05:59 Madrid before the snapshot: previous cycle, no snapshot
    await play("2026-11-15T05:00:00Z", starter, 100); // 06:00 Madrid the next day: next cycle, no snapshot yet
    expect(await q("select cycle_date::text d, points from manager_cycle_points where user_id = $1", [user])).toEqual([
      { d: "2026-11-14", points: 10 },
    ]);
  });

  test("ignores bench players", async () => {
    const { user, bench } = await setup();
    await play("2026-11-14T10:00:00Z", bench, 9);
    expect(await q("select * from manager_cycle_points where user_id = $1", [user])).toEqual([]);
  });

  test("follows the snapshot, not a lineup changed afterwards", async () => {
    const { user, starter, bench } = await setup();
    await play("2026-11-14T10:00:00Z", starter, 7);
    await db.query("delete from lineups where user_id = $1 and player_id = $2", [user, starter]);
    await db.query("insert into lineups (user_id, player_id) values ($1, $2)", [user, bench]);
    await play("2026-11-14T11:00:00Z", bench, 9);
    expect(await q("select points from manager_cycle_points where user_id = $1", [user])).toEqual([{ points: 7 }]);
  });

  test("any signed-in user can read everyone's points", async () => {
    const { user } = await setup();
    await play("2026-11-14T10:00:00Z", (await q<{ id: string }>("select player_id id from lineups where user_id = $1 limit 1", [user]))[0].id, 4);
    const other = await addUser(db);
    const seen = await asUser(db, other, async () => (await db.query("select * from manager_cycle_points")).rows);
    expect(seen).toHaveLength(1);
  });
});
