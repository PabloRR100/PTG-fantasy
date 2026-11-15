import { describe, expect, test } from "vitest";
import { dispatchPending, type DispatchStore, type Sender } from "@/services/push-dispatch";
import type { OutboxRow, Prefs, StoredSub } from "@/services/notifications";
import { PushError } from "@/lib/webpush";

const sub = (user: string, endpoint: string): StoredSub => ({ user_id: user, endpoint_hash: `h-${endpoint}`, subscription: { endpoint, keys: { p256dh: "k", auth: "a" } } });
const row = (id: number, user = "u1", kind: OutboxRow["kind"] = "market_open"): OutboxRow => ({ id, user_id: user, kind, data: { count: 3 } });

function fakeStore(rows: OutboxRow[], subs: StoredSub[], prefs: Record<string, Prefs> = {}) {
  const finished = new Map<number, string>();
  const deleted: string[] = [];
  let deletable = true;
  const store: DispatchStore = {
    claim: async () => rows,
    subscriptions: async (ids) => subs.filter((s) => ids.includes(s.user_id)),
    prefs: async () => new Map(Object.entries(prefs)),
    finish: async (ids, state) => { ids.forEach((id) => finished.set(id, state)); },
    deleteSubscription: async (user, hash) => { deleted.push(`${user}:${hash}`); return deletable; },
  };
  return { store, finished, deleted, cannotDelete: () => { deletable = false; } };
}
const okSender = (log: string[] = []): Sender => async (s, payload) => { log.push(`${s.endpoint} ${JSON.parse(payload).title}`); };

describe("dispatchPending", () => {
  test("sends each claimed row to the owner's devices and marks it sent", async () => {
    const log: string[] = [];
    const t = fakeStore([row(1)], [sub("u1", "https://push/1"), sub("u1", "https://push/2")]);
    const report = await dispatchPending(t.store, okSender(log));
    expect(log.sort()).toEqual(["https://push/1 Mercado abierto", "https://push/2 Mercado abierto"]);
    expect(t.finished.get(1)).toBe("sent");
    expect(report).toMatchObject({ claimed: 1, notified: 1, deliveries: 2, skipped: 0, failed: 0, expired: 0 });
  });

  test("a manager with no device or with the kind switched off is skipped, and nothing is sent", async () => {
    const log: string[] = [];
    const t = fakeStore([row(1, "nobody"), row(2, "u1")], [sub("u1", "https://push/1")], { u1: { bids: true, market: false } });
    const report = await dispatchPending(t.store, okSender(log));
    expect(log).toEqual([]);
    expect([t.finished.get(1), t.finished.get(2)]).toEqual(["skipped", "skipped"]);
    expect(report.skipped).toBe(2);
  });

  test("a device that answers 410 or 404 is deleted by its stored hash, and the row is skipped when no device is left", async () => {
    for (const status of [410, 404]) {
      const t = fakeStore([row(1)], [sub("u1", "https://push/dead")]);
      const report = await dispatchPending(t.store, async () => { throw new PushError(status, "gone"); });
      expect(t.deleted).toEqual(["u1:h-https://push/dead"]);
      expect(t.finished.get(1)).toBe("skipped");
      expect(report).toMatchObject({ expired: 1, failedToClean: 0 });
    }
  });

  test("a dead device does not stop the live one from being notified", async () => {
    const t = fakeStore([row(1)], [sub("u1", "https://push/dead"), sub("u1", "https://push/live")]);
    const report = await dispatchPending(t.store, async (s) => { if (s.endpoint.endsWith("dead")) throw new PushError(410, ""); });
    expect(t.finished.get(1)).toBe("sent");
    expect(report).toMatchObject({ deliveries: 1, expired: 1 });
  });

  test("a deletion that did not remove a row is reported, never counted as cleaned", async () => {
    const t = fakeStore([row(1)], [sub("u1", "https://push/dead")]);
    t.cannotDelete();
    const report = await dispatchPending(t.store, async () => { throw new PushError(410, ""); });
    expect(report).toMatchObject({ expired: 0, failedToClean: 1 });
  });

  test("our own mistakes (401, 403, 400) never delete a subscription", async () => {
    for (const status of [400, 401, 403, 413, 500]) {
      const t = fakeStore([row(1)], [sub("u1", "https://push/1")]);
      const report = await dispatchPending(t.store, async () => { throw new PushError(status, "no"); });
      expect(t.deleted).toEqual([]);
      expect(t.finished.get(1)).toBe("failed");
      expect(report.failed).toBe(1);
    }
  });

  test("a transient error is retried once before giving up", async () => {
    let calls = 0;
    const t = fakeStore([row(1)], [sub("u1", "https://push/1")]);
    await dispatchPending(t.store, async () => { calls++; if (calls === 1) throw new Error("network"); });
    expect(calls).toBe(2);
    expect(t.finished.get(1)).toBe("sent");
  });

  test("one row failing never leaves the others unprocessed or in 'sending'", async () => {
    const t = fakeStore([row(1, "u1"), row(2, "u2")], [sub("u1", "https://push/1"), sub("u2", "https://push/2")]);
    await dispatchPending(t.store, async (s) => { if (s.endpoint.endsWith("/1")) throw new Error("boom"); });
    expect(t.finished.get(1)).toBe("failed");
    expect(t.finished.get(2)).toBe("sent");
  });

  test("a device found dead is not tried again for the next notification of the same run, nor reported as an uncleaned leftover", async () => {
    const attempts: string[] = [];
    const t = fakeStore([row(1), row(2, "u1", "bid_lost")], [sub("u1", "https://push/dead"), sub("u1", "https://push/live")]);
    const report = await dispatchPending(t.store, async (s) => { attempts.push(s.endpoint); if (s.endpoint.endsWith("dead")) throw new PushError(410, ""); });
    expect(attempts.filter((a) => a.endsWith("dead"))).toHaveLength(1);
    expect(t.deleted).toEqual(["u1:h-https://push/dead"]);
    expect(report).toMatchObject({ expired: 1, failedToClean: 0, notified: 2, deliveries: 2 });
  });

  test("nothing claimed means no other query is made", async () => {
    let touched = false;
    const store: DispatchStore = { claim: async () => [], subscriptions: async () => { touched = true; return []; }, prefs: async () => { touched = true; return new Map(); }, finish: async () => { touched = true; }, deleteSubscription: async () => true };
    expect(await dispatchPending(store, okSender())).toMatchObject({ claimed: 0 });
    expect(touched).toBe(false);
  });
});
