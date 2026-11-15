import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { PushError } from "@/lib/webpush";
import { DEFAULT_PREFS, type OutboxRow, type Prefs, type StoredSub } from "@/services/notifications";
import { dispatchPending, type DispatchStore } from "@/services/push-dispatch";
import { addUser, asUser, freshDb, seedPlayers } from "./db";

// close_cycle -> outbox -> claim -> dispatch, against the real SQL. The store below is the same five operations
// as src/services/push-store.ts, written as SQL so the whole chain runs without Supabase.

let db: PGlite;
const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const NOW = "2026-11-14T05:00:00Z";

function sqlStore(): DispatchStore {
  return {
    claim: async (limit) => q<OutboxRow>("select id::int, user_id, kind, data from claim_notifications($1)", [limit]),
    subscriptions: async (ids) => q<StoredSub>("select user_id, subscription, endpoint_hash from push_subscriptions where user_id = any($1::uuid[])", [ids]),
    prefs: async (ids) => new Map((await q<{ user_id: string; bids: boolean; market: boolean }>("select user_id, bids, market from notification_prefs where user_id = any($1::uuid[])", [ids])).map((r) => [r.user_id, { ...DEFAULT_PREFS, bids: r.bids, market: r.market } as Prefs])),
    finish: async (ids, state) => { await db.query("update notification_outbox set state = $2, processed_at = now() where id = any($1::bigint[])", [ids, state]); },
    deleteSubscription: async (user, hash) => (await db.query("delete from push_subscriptions where user_id = $1 and endpoint_hash = $2", [user, hash])).affectedRows === 1,
  };
}

async function manager(team: string) {
  const id = await addUser(db);
  await asUser(db, id, () => db.query("select create_manager($1)", [team]));
  return id;
}
async function device(user: string, endpoint: string) {
  const subscription = JSON.stringify({ endpoint, keys: { p256dh: "k", auth: "a" } });
  await db.query("insert into push_subscriptions (user_id, subscription, endpoint_hash) values ($1, $2::jsonb, $3)", [user, subscription, `hash-${endpoint}`]);
}
const states = async () => (await q<{ kind: string; state: string; n: number }>("select kind, state, count(*)::int n from notification_outbox group by 1, 2 order by 1, 2")).map((r) => `${r.kind}:${r.state}:${r.n}`);

beforeEach(async () => {
  db = await freshDb();
  await seedPlayers(db, 16);
});

describe("the whole chain", () => {
  async function scenario() {
    const [a, b] = [await manager("Equipo A"), await manager("Equipo B")];
    await device(a, "https://push.test/a-phone");
    await device(a, "https://push.test/a-laptop");
    await device(b, "https://push.test/b-phone");
    const player = (await q<{ id: string }>("select id from players where color = 'Blanco' and id not in (select player_id from squads) limit 1"))[0].id;
    const listing = (await q<{ id: string }>("insert into market_listings (player_id, closes_at) values ($1, now() + interval '1 day') returning id", [player]))[0].id;
    await asUser(db, a, () => db.query("select place_bid($1, 1500000)", [listing]));
    await asUser(db, b, () => db.query("select place_bid($1, 1100000)", [listing]));
    await db.query("select close_cycle(false, $1::timestamptz)", [NOW]);
    return { a, b };
  }

  test("each manager hears the right thing on each of their devices", async () => {
    const { a, b } = await scenario();
    const sent: string[] = [];
    const report = await dispatchPending(sqlStore(), async (s, json) => { sent.push(`${s.endpoint.split("/").pop()}|${JSON.parse(json).title}`); });
    expect(sent.sort()).toEqual([
      "a-laptop|Mercado abierto", "a-laptop|¡Es tuyo!",
      "a-phone|Mercado abierto", "a-phone|¡Es tuyo!",
      "b-phone|Mercado abierto", "b-phone|Puja perdida",
    ]);
    expect(report).toMatchObject({ claimed: 4, notified: 4, deliveries: 6, failed: 0 });
    expect(await states()).toEqual(["bid_lost:sent:1", "bid_won:sent:1", "market_open:sent:2"]);
    expect(a).not.toBe(b);
  });

  test("a manager who switched bid results off still hears about the market, and the skipped row is closed out", async () => {
    const { b } = await scenario();
    await db.query("insert into notification_prefs (user_id, bids) values ($1, false)", [b]);
    const sent: string[] = [];
    const report = await dispatchPending(sqlStore(), async (s, json) => { sent.push(`${s.endpoint.split("/").pop()}|${JSON.parse(json).title}`); });
    expect(sent).toContain("b-phone|Mercado abierto");
    expect(sent).not.toContain("b-phone|Puja perdida");
    expect(report.skipped).toBe(1);
    expect(await states()).toEqual(["bid_lost:skipped:1", "bid_won:sent:1", "market_open:sent:2"]);
  });

  test("a device the gateway reports gone is deleted for real, and the others carry on", async () => {
    await scenario();
    const report = await dispatchPending(sqlStore(), async (s) => { if (s.endpoint.endsWith("b-phone")) throw new PushError(410, "gone"); });
    expect(report).toMatchObject({ expired: 1, failedToClean: 0, notified: 2 }); // B's phone is found dead once and not tried again for B's second notification
    expect(await q("select endpoint_hash from push_subscriptions order by 1")).toEqual([{ endpoint_hash: "hash-https://push.test/a-laptop" }, { endpoint_hash: "hash-https://push.test/a-phone" }]);
    expect((await states()).every((s) => !s.includes("sending") && !s.includes("pending"))).toBe(true);
  });

  test("a second run finds nothing left to do", async () => {
    await scenario();
    await dispatchPending(sqlStore(), async () => {});
    expect(await dispatchPending(sqlStore(), async () => { throw new Error("must not send"); })).toMatchObject({ claimed: 0, deliveries: 0 });
  });

  test("a refusal that is our fault leaves every subscription in place and marks the rows failed", async () => {
    await scenario();
    await dispatchPending(sqlStore(), async () => { throw new PushError(403, "bad vapid key"); });
    expect((await q("select 1 from push_subscriptions")).length).toBe(3);
    expect(await states()).toEqual(["bid_lost:failed:1", "bid_won:failed:1", "market_open:failed:2"]);
  });
});
