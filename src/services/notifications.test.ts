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
    const prefs = { bids: false, market: true, jornada: true };
    expect(prefAllows("bid_won", prefs)).toBe(false);
    expect(prefAllows("bid_lost", prefs)).toBe(false);
    expect(prefAllows("market_open", prefs)).toBe(true);
    expect(prefAllows("market_open", { bids: true, market: false, jornada: true })).toBe(false);
  });
  test("by default everything is on", () => expect(DEFAULT_PREFS).toEqual({ bids: true, market: true, jornada: true }));
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
    const plan = planDispatch([row()], subs, new Map([["u1", { bids: false, market: true, jornada: true }]]));
    expect(plan.send).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(["prefs"]);
  });
  test("preferences only silence their own kind", () => {
    const rows = [row({ id: 1 }), row({ id: 2, kind: "market_open", data: { count: 3 } })];
    const plan = planDispatch(rows, subs, new Map([["u1", { bids: false, market: true, jornada: true }]]));
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

describe("jornada_closed", () => {
  const data = { week_start: "2026-11-09", points: 40, rank: 1, teams: 11, overall_rank: 3, delta: 2, winner: "Soy Batman" };
  test("says the points, the places and the movement, and links to that jornada", () => {
    const p = buildNotification(row({ kind: "jornada_closed", data }));
    expect(p).toMatchObject({ title: "Jornada cerrada", url: "/jornada?semana=2026-11-09", tag: "padel-jornada-2026-11-09" });
    expect(p.body).toBe("Has sumado 40 pts: 1º de 11. Ahora eres 3º en la clasificación (subes 2).");
  });
  test("names the winner when it is someone else, and handles a silent week and missing fields", () => {
    expect(buildNotification(row({ kind: "jornada_closed", data: { ...data, rank: 4, points: 12, delta: -1 } })).body).toBe("Has sumado 12 pts: 4º de 11. Ahora eres 3º en la clasificación (bajas 1). Ganó Soy Batman.");
    expect(buildNotification(row({ kind: "jornada_closed", data: { ...data, points: 0, rank: 11, delta: 0 } })).body).toContain("no sumaste puntos");
    expect(buildNotification(row({ kind: "jornada_closed", data: {} })).body).toBe("Ya están los resultados de la jornada.");
  });
  test("follows its own switch", () => {
    expect(prefAllows("jornada_closed", { bids: true, market: true, jornada: false })).toBe(false);
    expect(prefAllows("jornada_closed", { bids: false, market: false, jornada: true })).toBe(true);
  });
});

describe("clause_taken", () => {
  test("tells the seller who took which player and what they got", () => {
    const p = buildNotification(row({ kind: "clause_taken", data: { player: "Kike", amount: 3_000_000, buyer: "Pepo PC" } }));
    expect(p.title).toBe("Te han pagado una cláusula");
    expect(p.body).toContain("Pepo PC se ha llevado a Kike por");
    expect(p.url).toBe("/equipo");
  });
});
