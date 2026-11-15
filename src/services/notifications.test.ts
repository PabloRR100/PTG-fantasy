import { describe, expect, test } from "vitest";
import { DEFAULT_PREFS, buildNotification, planDispatch, prefAllows, type OutboxRow, type StoredSub } from "@/services/notifications";

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({ id: 1, user_id: "u1", kind: "bid_won", data: { player: "Kike", amount: 1_300_000 }, ...over });
const sub = (user: string, endpoint: string): StoredSub => ({ user_id: user, endpoint_hash: `h-${endpoint}`, subscription: { endpoint, keys: { p256dh: "k", auth: "a" } } });

describe("buildNotification", () => {
  test("a won bid names the player and the price and opens the team", () => {
    expect(buildNotification(row())).toMatchObject({ title: "¡Es tuyo!", body: "Has fichado a Kike por 1.300.000 €.", url: "/equipo" });
  });
  test("a lost bid names the player and opens the market", () => {
    expect(buildNotification(row({ kind: "bid_lost", data: { player: "Kike" } }))).toMatchObject({ title: "Puja perdida", body: "No te has llevado a Kike.", url: "/mercado" });
  });
  test("the new market says how many players are up", () => {
    expect(buildNotification(row({ kind: "market_open", data: { count: 12 } }))).toMatchObject({ title: "Mercado abierto", body: "Hay 12 jugadores en subasta.", url: "/mercado" });
    expect(buildNotification(row({ kind: "market_open", data: { count: 1 } })).body).toBe("Hay 1 jugador en subasta.");
  });
  test("missing or odd data never produces 'undefined' or 'NaN'", () => {
    expect(buildNotification(row({ data: {} })).body).toBe("Has fichado a ese jugador.");
    expect(buildNotification(row({ data: { player: 5, amount: "x" } })).body).not.toMatch(/undefined|NaN|\[object/);
    expect(buildNotification(row({ kind: "market_open", data: {} })).body).toBe("Hay jugadores nuevos en subasta.");
  });
  test("the tag groups repeats of the same kind so the phone does not stack them", () => {
    expect(buildNotification(row({ kind: "market_open", data: { count: 3 } })).tag).toBe(buildNotification(row({ id: 99, kind: "market_open", data: { count: 12 } })).tag);
    expect(buildNotification(row({ data: { player: "A", amount: 1 } })).tag).not.toBe(buildNotification(row({ data: { player: "B", amount: 1 } })).tag);
  });
});

describe("prefAllows", () => {
  test("bid results follow the bids switch, a new market follows the market switch", () => {
    const prefs = { bids: false, market: true };
    expect(prefAllows("bid_won", prefs)).toBe(false);
    expect(prefAllows("bid_lost", prefs)).toBe(false);
    expect(prefAllows("market_open", prefs)).toBe(true);
    expect(prefAllows("market_open", { bids: true, market: false })).toBe(false);
  });
  test("by default everything is on", () => expect(DEFAULT_PREFS).toEqual({ bids: true, market: true }));
});

describe("planDispatch", () => {
  const subs = new Map([["u1", [sub("u1", "https://push/1"), sub("u1", "https://push/2")]]]);

  test("a row goes to every device of its owner", () => {
    const plan = planDispatch([row()], subs, new Map());
    expect(plan.skipped).toEqual([]);
    expect(plan.send).toHaveLength(1);
    expect(plan.send[0].subs).toHaveLength(2);
    expect(plan.send[0].payload.title).toBe("¡Es tuyo!");
  });
  test("a manager with no device is skipped, not failed", () => {
    expect(planDispatch([row({ user_id: "nobody" })], subs, new Map()).skipped).toEqual([{ row: row({ user_id: "nobody" }), reason: "no_subscription" }]);
  });
  test("a switched-off kind is skipped, whatever devices exist", () => {
    const plan = planDispatch([row()], subs, new Map([["u1", { bids: false, market: true }]]));
    expect(plan.send).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(["prefs"]);
  });
  test("preferences only silence their own kind", () => {
    const rows = [row({ id: 1 }), row({ id: 2, kind: "market_open", data: { count: 3 } })];
    const plan = planDispatch(rows, subs, new Map([["u1", { bids: false, market: true }]]));
    expect(plan.send.map((s) => s.row.id)).toEqual([2]);
  });
  test("two rows for the same device are sent separately, one device never listed twice for one row", () => {
    const dupes = new Map([["u1", [sub("u1", "https://push/1"), sub("u1", "https://push/1")]]]);
    expect(planDispatch([row()], dupes, new Map()).send[0].subs).toHaveLength(1);
  });
  test("a subscription with no endpoint is ignored", () => {
    const broken = new Map([["u1", [{ user_id: "u1", endpoint_hash: "x", subscription: { keys: {} } } as unknown as StoredSub]]]);
    expect(planDispatch([row()], broken, new Map()).skipped[0].reason).toBe("no_subscription");
  });
});
