import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, freshDb, seedPlayers } from "./db";

// The Tablón: every signing and every sale to the market leaves one public row; the inbox is private to its owner.

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const DAY1 = "2026-11-14T05:00:00Z";
const close = (now = DAY1) => db.query("select close_cycle(false, $1::timestamptz)", [now]);

async function manager(name: string) {
  const id = await addUser(db);
  await asUser(db, id, () => db.query("select create_manager($1)", [name]));
  return id;
}
const activity = () => q<{ kind: string; user_id: string; player_id: string; amount: number }>("select kind, user_id, player_id, amount from activity order by id");

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 8);
});

describe("activity", () => {
  test("a new team's starting squad is not news", async () => {
    await manager("Alfa");
    expect(await activity()).toEqual([]);
  });

  test("selling a player to the market posts a 'sold' row at his value", async () => {
    const a = await manager("Alfa");
    // Any bench player: every level holds 3 and only 2 start, so selling the third is allowed.
    const [p] = await q<{ id: string; value: number }>(
      "select p.id, p.value from squads s join players p on p.id = s.player_id where s.user_id = $1 and s.player_id not in (select player_id from lineups where user_id = $1) limit 1", [a]);
    await asUser(db, a, () => db.query("select sell_player($1)", [p.id]));
    expect(await activity()).toEqual([{ kind: "sold", user_id: a, player_id: p.id, amount: p.value }]);
  });

  test("a refused sale posts nothing", async () => {
    const a = await manager("Alfa");
    // A level reduced to its 2 starters: selling one of them would leave fewer than 2.
    const [p] = await q<{ player_id: string }>("select l.player_id from lineups l join players p on p.id = l.player_id where l.user_id = $1 and p.color = 'Rosa' limit 1", [a]);
    await db.query("delete from squads where user_id = $1 and player_id in (select s.player_id from squads s join players p on p.id = s.player_id where s.user_id = $1 and p.color = 'Rosa' and s.player_id not in (select player_id from lineups where user_id = $1))", [a]);
    await asUser(db, a, async () => {
      await expect(db.query("select sell_player($1)", [p.player_id])).rejects.toThrow(/at least 2/);
    });
    expect(await activity()).toEqual([]);
  });

  test("a winning bid posts a 'signed' row at the winning amount; a lost listing posts nothing", async () => {
    const a = await manager("Alfa");
    await close(); // opens listings
    const listings = await q<{ id: string; player_id: string }>("select id, player_id from market_listings where status = 'open' order by id limit 2");
    await db.query("insert into bids (listing_id, user_id, amount) values ($1, $2, 1234567)", [listings[0].id, a]);
    await close("2026-11-15T05:00:00Z");
    expect(await activity()).toEqual([{ kind: "signed", user_id: a, player_id: listings[0].player_id, amount: 1_234_567 }]);
  });

  test("every signed-in user can read the feed; visitors cannot; nobody writes it directly", async () => {
    const a = await manager("Alfa");
    const b = await addUser(db);
    await db.query("insert into activity (kind, user_id, player_id, amount) select 'sold', $1, id, 1 from players limit 1", [a]);
    expect(await asUser(db, b, () => q("select * from activity"))).toHaveLength(1);
    await asUser(db, b, async () => {
      const r = await db.query("insert into activity (kind, user_id, player_id, amount) select 'sold', $1, id, 1 from players limit 1", [a]).then(() => "ok", () => "denied");
      expect(r).toBe("denied");
    });
    await db.exec("set role anon");
    try { expect(await db.query("select * from activity").then((r) => r.rows, () => [])).toEqual([]); } finally { await db.exec("reset role"); }
  });

  test("deleting a team removes its rows with it", async () => {
    const a = await manager("Alfa");
    await db.query("insert into activity (kind, user_id, player_id, amount) select 'sold', $1, id, 1 from players limit 1", [a]);
    await db.query("delete from profiles where user_id = $1", [a]);
    expect(await activity()).toEqual([]);
  });
});

describe("inbox", () => {
  test("each manager reads only their own notifications and marks only their own as read", async () => {
    const a = await manager("Alfa");
    const b = await manager("Beta");
    await db.query("insert into notification_outbox (user_id, kind) values ($1, 'market_open'), ($2, 'market_open')", [a, b]);
    expect(await asUser(db, a, () => q("select user_id from notification_outbox"))).toEqual([{ user_id: a }]);
    await asUser(db, a, () => db.query("select mark_notifications_read()"));
    expect(await q<{ user_id: string; read: boolean }>("select user_id, read_at is not null as read from notification_outbox order by user_id")).toEqual(
      [{ user_id: a, read: true }, { user_id: b, read: false }].sort((x, y) => x.user_id.localeCompare(y.user_id)),
    );
  });

  test("a visitor cannot mark anything", async () => {
    await db.exec("set role anon");
    try { await expect(db.query("select mark_notifications_read()")).rejects.toThrow(/permission denied/); } finally { await db.exec("reset role"); }
  });

  test("a signed-in user cannot edit or delete notification rows directly", async () => {
    const a = await manager("Alfa");
    await db.query("insert into notification_outbox (user_id, kind) values ($1, 'market_open')", [a]);
    await asUser(db, a, async () => {
      await db.query("update notification_outbox set state = 'sent', read_at = null where user_id = $1", [a]).catch(() => undefined);
      await db.query("delete from notification_outbox where user_id = $1", [a]).catch(() => undefined);
    });
    expect(await q("select state from notification_outbox")).toEqual([{ state: "pending" }]);
  });
});
