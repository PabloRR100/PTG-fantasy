import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, COLORS, freshDb, seedPlayers } from "./db";

// Web push: who may store a subscription, how close_cycle queues the notifications, and how the
// dispatcher claims them.

let db: PGlite;
const NOW = "2026-11-14T05:00:00Z"; // 06:00 Madrid
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 16);
});

async function manager(team: string): Promise<string> {
  const id = await addUser(db);
  await asUser(db, id, () => db.query("select create_manager($1)", [team]));
  return id;
}
const freePlayer = async (color = "Blanco") =>
  (await q<{ id: string }>(
    "select id from players where color = $1 and id not in (select player_id from squads) and id not in (select player_id from market_listings) order by value desc limit 1",
    [color],
  ))[0].id;
const openListing = async (color = "Blanco") =>
  (await q<{ id: string }>("insert into market_listings (player_id, closes_at) values ($1, now() + interval '1 day') returning id", [await freePlayer(color)]))[0].id;
const bid = (user: string, listing: string, amount: number) =>
  asUser(db, user, () => db.query("select place_bid($1, $2)", [listing, amount]));
const close = () => db.query("select close_cycle(false, $1::timestamptz)", [NOW]);
const outbox = () => q<{ user_id: string; kind: string; data: Record<string, unknown> }>("select user_id, kind, data from notification_outbox order by id");
const playerName = async (listing: string) =>
  (await q<{ display_name: string }>("select p.display_name from market_listings l join players p on p.id = l.player_id where l.id = $1", [listing]))[0].display_name;

describe("who can touch push subscriptions and preferences", () => {
  const sub = (endpoint: string) => JSON.stringify({ endpoint, keys: { p256dh: "k", auth: "a" } });

  test("a manager stores and reads their own subscription, and no one else's", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    await asUser(db, a, () => db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, $2, 'h-a')", [a, sub("https://push.example/a")]));
    await asUser(db, b, () => db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, $2, 'h-b')", [b, sub("https://push.example/b")]));
    expect(await asUser(db, a, () => q("select endpoint_hash from push_subscriptions"))).toEqual([{ endpoint_hash: "h-a" }]);
  });

  test("a manager cannot store a subscription for someone else", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const attempt = asUser(db, a, () => db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, $2, 'h')", [b, sub("https://push.example/x")]));
    await expect(attempt).rejects.toThrow();
    expect(await q("select 1 from push_subscriptions")).toEqual([]);
  });

  test("the same device twice is one row (user + endpoint hash is unique)", async () => {
    const a = await manager("Equipo A");
    const insert = () => asUser(db, a, () => db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, $2, 'same')", [a, sub("https://push.example/a")]));
    await insert();
    await expect(insert()).rejects.toThrow();
  });

  test("a manager cannot delete or change another manager's subscription", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    await asUser(db, a, () => db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, $2, 'h-a')", [a, sub("https://push.example/a")]));
    await asUser(db, b, async () => {
      await db.query("delete from push_subscriptions");
      await db.query("update push_subscriptions set endpoint_hash = 'hacked'");
    });
    expect(await q("select endpoint_hash from push_subscriptions")).toEqual([{ endpoint_hash: "h-a" }]);
  });

  test("a visitor with no session reads and writes nothing", async () => {
    const a = await manager("Equipo A");
    await db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, $2, 'h')", [a, sub("https://push.example/a")]);
    await db.exec("set role anon");
    try {
      expect(await q("select * from push_subscriptions").catch(() => [])).toEqual([]);
      await expect(db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, '{}', 'x')", [a])).rejects.toThrow();
    } finally { await db.exec("reset role"); }
  });

  test("preferences default to everything on, and each manager edits only their own", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    await asUser(db, a, () => db.query("insert into notification_prefs (user_id, bids, market) values ($1, false, true)", [a]));
    expect(await asUser(db, a, () => q("select bids, market from notification_prefs"))).toEqual([{ bids: false, market: true }]);
    expect(await asUser(db, b, () => q("select * from notification_prefs"))).toEqual([]);
    await asUser(db, b, () => db.query("update notification_prefs set bids = true"));
    expect(await q("select bids from notification_prefs")).toEqual([{ bids: false }]);
    await db.query("insert into notification_prefs (user_id) values ($1)", [b]);
    expect(await q("select bids, market from notification_prefs where user_id = $1", [b])).toEqual([{ bids: true, market: true }]);
  });

  test("the claim function is out of reach of signed-in users and visitors; the outbox shows each user only their own rows (0010)", async () => {
    const a = await manager("Equipo A");
    const b = await manager("Equipo B");
    await db.query("insert into notification_outbox (user_id, kind) values ($1, 'market_open')", [a]);
    expect(await asUser(db, a, () => q("select user_id from notification_outbox"))).toEqual([{ user_id: a }]);
    expect(await asUser(db, b, () => q("select * from notification_outbox"))).toEqual([]);
    await db.exec("set role anon");
    try { expect(await db.query("select * from notification_outbox").then((r) => r.rows, () => [])).toEqual([]); } finally { await db.exec("reset role"); }
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try { await expect(db.query("select * from claim_notifications(10)")).rejects.toThrow(); } finally { await db.exec("reset role"); }
    }
  });
});

describe("close_cycle queues the notifications", () => {
  test("the winner is told what they won and for how much; the other bidder is told they lost", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const listing = await openListing();
    await bid(a, listing, 1_100_000);
    await bid(b, listing, 1_300_000);
    await close();
    const name = await playerName(listing);
    const rows = (await outbox()).filter((r) => r.kind !== "market_open");
    expect(rows).toEqual(expect.arrayContaining([
      { user_id: b, kind: "bid_won", data: { player: name, amount: 1_300_000 } },
      { user_id: a, kind: "bid_lost", data: { player: name } },
    ]));
    expect(rows).toHaveLength(2);
  });

  test("a bidder who could no longer pay is told they lost, and the next bidder wins", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const listing = await openListing();
    await bid(a, listing, 1_500_000);
    await bid(b, listing, 1_100_000);
    await db.query("update profiles set budget = 200000 where user_id = $1", [a]);
    await close();
    const rows = (await outbox()).filter((r) => r.kind !== "market_open");
    expect(rows.map((r) => [r.user_id, r.kind]).sort()).toEqual([[a, "bid_lost"], [b, "bid_won"]].sort());
  });

  test("nobody wins a listing nobody can pay: every bidder gets bid_lost, once", async () => {
    const a = await manager("Equipo A");
    const listing = await openListing();
    await bid(a, listing, 1_500_000);
    await bid(a, listing, 1_600_000); // two bids by the same manager on the same listing
    await db.query("update profiles set budget = 0 where user_id = $1", [a]);
    await close();
    expect((await outbox()).filter((r) => r.kind !== "market_open")).toHaveLength(1);
    expect((await outbox()).find((r) => r.kind === "bid_lost")?.user_id).toBe(a);
  });

  test("a manager who bid twice and won is told once", async () => {
    const a = await manager("Equipo A");
    const listing = await openListing();
    await bid(a, listing, 1_100_000);
    await bid(a, listing, 1_400_000);
    await close();
    const rows = (await outbox()).filter((r) => r.kind !== "market_open");
    expect(rows).toEqual([{ user_id: a, kind: "bid_won", data: { player: await playerName(listing), amount: 1_400_000 } }]);
  });

  test("every team is told the new market is open, with how many players were listed", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    await close();
    const open = (await q<{ n: number }>("select count(*)::int n from market_listings where status = 'open'"))[0].n;
    const rows = (await outbox()).filter((r) => r.kind === "market_open");
    expect(rows.map((r) => r.user_id).sort()).toEqual([a, b].sort());
    expect(rows.every((r) => r.data.count === open)).toBe(true);
    expect(open).toBeGreaterThan(0);
  });

  test("no market_open when there were no free players to list", async () => {
    await manager("Equipo A");
    await db.query("insert into squads (player_id, user_id) select p.id, (select user_id from profiles limit 1) from players p where not exists (select 1 from squads s where s.player_id = p.id)");
    await close();
    expect((await outbox()).filter((r) => r.kind === "market_open")).toEqual([]);
  });

  test("the close itself behaves exactly as before: same winner, same money", async () => {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    const listing = await openListing();
    await bid(a, listing, 1_100_000);
    await bid(b, listing, 1_300_000);
    await close();
    expect(await q("select user_id from squads s join market_listings l on l.player_id = s.player_id where l.id = $1", [listing])).toEqual([{ user_id: b }]);
    expect(await q("select budget from profiles where user_id = $1", [b])).toEqual([{ budget: 3_700_000 }]);
  });

  test("closing twice in the same cycle queues once", async () => {
    await manager("Equipo A");
    await close();
    const before = (await outbox()).length;
    await close();
    expect((await outbox()).length).toBe(before);
  });
});

describe("claim_notifications", () => {
  const queue = async (n: number) => {
    const a = await manager("Equipo A");
    for (let i = 0; i < n; i++) await db.query("insert into notification_outbox (user_id, kind) values ($1, 'market_open')", [a]);
    return a;
  };

  test("takes the oldest pending rows up to the limit and marks them sending", async () => {
    await queue(5);
    const first = await q<{ id: string; state: string }>("select id, state from claim_notifications(3)");
    expect(first).toHaveLength(3);
    expect(first.every((r) => r.state === "sending")).toBe(true);
    expect((await q("select 1 from notification_outbox where state = 'pending'"))).toHaveLength(2);
  });

  test("a row is claimed once: a second run gets only what is left", async () => {
    await queue(4);
    await q("select * from claim_notifications(10)");
    expect(await q("select * from claim_notifications(10)")).toEqual([]);
  });

  test("a claim that was never finished is picked up again after 10 minutes", async () => {
    await queue(1);
    await q("select * from claim_notifications(10)");
    await db.query("update notification_outbox set claimed_at = now() - interval '11 minutes'");
    expect(await q("select * from claim_notifications(10)")).toHaveLength(1);
  });

  test("a recent claim is left alone", async () => {
    await queue(1);
    await q("select * from claim_notifications(10)");
    expect(await q("select * from claim_notifications(10)")).toEqual([]);
  });
});

describe("rolling the migration out", () => {
  test("applying it leaves an open round untouched", async () => {
    db = await freshDb({ stopBefore: "0006" });
    await seedPlayers(db, 16, COLORS.slice(0, 4)); // before 0009 the schema knows four colors
    await manager("Equipo A");
    await close(); // opens the round with the previous close_cycle
    const snapshot = async () => ({
      listings: await q("select id, player_id, status, closes_at from market_listings order by id"),
      cycles: await q("select cycle_date::text, closed_at from cycles"),
      budgets: await q("select user_id, budget from profiles order by user_id"),
    });
    const before = await snapshot();
    await db.exec(readFileSync(new URL("../migrations/0006_push.sql", import.meta.url), "utf8"));
    expect(await snapshot()).toEqual(before);
    expect(await q("select 1 from notification_outbox")).toEqual([]);
  });
});
