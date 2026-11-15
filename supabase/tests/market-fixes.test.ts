import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, freshDb, seedPlayers } from "./db";

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
async function manager(name: string) {
  const id = await addUser(db);
  await asUser(db, id, () => db.query("select create_manager($1)", [name]));
  return id;
}
const openPerColor = async () => {
  const rows = await q<{ color: string; n: number }>("select p.color, count(*)::int n from market_listings l join players p on p.id = l.player_id where l.status = 'open' group by 1");
  return COLORS.map((c) => rows.find((r) => r.color === c)?.n ?? 0);
};

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 12);
});

describe("a listed player cannot end up on a squad by the draw, nor take bids once owned", () => {
  test("create_manager never picks a player with an open listing", async () => {
    await db.query("select open_market_listings()");
    const listed = (await q<{ player_id: string }>("select player_id from market_listings where status = 'open'")).map((r) => r.player_id);
    for (let i = 0; i < 3; i++) await manager(`Equipo ${i}`);
    const taken = await q<{ player_id: string }>("select player_id from squads where player_id = any($1::uuid[])", [listed]);
    expect(taken).toEqual([]);
  });

  test("place_bid refuses a listing whose player already has a team", async () => {
    const owner = await manager("Alfa");
    const bidder = await manager("Beta");
    const [{ player_id }] = await q<{ player_id: string }>("select player_id from squads where user_id = $1 limit 1", [owner]);
    const [{ id }] = await q<{ id: string }>("insert into market_listings (player_id, closes_at) values ($1, now() + interval '1 day') returning id", [player_id]);
    await asUser(db, bidder, async () => {
      await expect(db.query("select place_bid($1, 5000000)", [id])).rejects.toThrow(/already has a team/);
    });
    expect(await q("select 1 from bids")).toEqual([]);
  });

  test("a bid on a free listed player still works", async () => {
    const bidder = await manager("Beta");
    await db.query("select open_market_listings()");
    const [{ id, value }] = await q<{ id: string; value: number }>("select l.id, p.value from market_listings l join players p on p.id = l.player_id where l.status = 'open' limit 1");
    await asUser(db, bidder, () => db.query("select place_bid($1, $2)", [id, value]));
    expect(await q("select 1 from bids")).toHaveLength(1);
  });
});

describe("open_market_listings", () => {
  test("opens max(3, teams) free players of every color, new colors included", async () => {
    await db.query("select open_market_listings()");
    expect(await openPerColor()).toEqual(COLORS.map(() => 3));
  });
  test("repeating it adds nothing; after one listing disappears it tops the color back up", async () => {
    await db.query("select open_market_listings()");
    expect((await q<{ n: number }>("select open_market_listings() n"))[0].n).toBe(0);
    await db.query("update market_listings set status = 'expired' where id = (select id from market_listings where status = 'open' limit 1)");
    expect((await q<{ n: number }>("select open_market_listings() n"))[0].n).toBe(1);
  });
  test("tops up only the colors that are short, closing together with the open ones", async () => {
    await db.query("select open_market_listings()");
    await db.query("update market_listings set status = 'expired' where player_id in (select id from players where color = 'Oro')");
    await db.query("select open_market_listings()");
    expect(await openPerColor()).toEqual(COLORS.map(() => 3));
    expect((await q<{ n: number }>("select count(distinct closes_at)::int n from market_listings where status = 'open'"))[0].n).toBe(1);
  });
  test("it never lists an owned player and only the scraper's role may call it", async () => {
    const user = await manager("Alfa");
    await db.query("select open_market_listings()");
    expect(await q("select 1 from market_listings l join squads s on s.player_id = l.player_id")).toEqual([]);
    await asUser(db, user, async () => {
      await expect(db.query("select open_market_listings()")).rejects.toThrow(/permission denied/);
    });
  });
});
