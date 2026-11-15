import { describe, expect, test } from "vitest";
import { describeActivity, groupByDay, inboxEntry, timeAgo, type ActivityRow } from "@/services/feed";

const base: ActivityRow = { avatar_url: null, id: 1, kind: "signed", team: "Los Pepros", player: "Kike", color: "Azul", gender: "male", amount: 1_500_000, created_at: "2026-11-15T05:00:00Z" };

describe("describeActivity", () => {
  test("a signing names the team and the player (the price is the card's amount)", () => {
    expect(describeActivity(base)).toEqual({ icon: "signed", heading: "Fichaje", text: "Los Pepros ha fichado a Kike" });
  });
  test("a sale to the market names the price the market paid", () => {
    expect(describeActivity({ ...base, kind: "sold", amount: 300_000 })).toEqual({ icon: "sold", heading: "Venta al mercado", text: "Los Pepros ha vendido a Kike al mercado" });
  });
  test("a team that no longer exists reads as an unknown team, never as 'null'", () => {
    expect(describeActivity({ ...base, team: null }).text).toBe("Un equipo ha fichado a Kike");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  test.each([
    ["2026-11-15T11:59:40Z", "ahora"],
    ["2026-11-15T11:30:00Z", "hace 30 min"],
    ["2026-11-15T09:00:00Z", "hace 3 h"],
    ["2026-11-14T12:00:00Z", "ayer"],
    ["2026-11-12T12:00:00Z", "hace 3 días"],
    ["2026-10-01T12:00:00Z", "1 oct"],
  ])("%s is %s", (iso, expected) => expect(timeAgo(iso, now)).toBe(expected));
  test("a time in the future (clock skew) reads as now", () => expect(timeAgo("2026-11-15T12:05:00Z", now)).toBe("ahora"));
});

describe("inboxEntry", () => {
  test("reuses the push wording and marks unread rows", () => {
    const e = inboxEntry({ id: 7, kind: "bid_won", data: { player: "Kike", amount: 1_500_000 }, created_at: "2026-11-15T05:00:00Z", read_at: null });
    expect(e).toMatchObject({ id: 7, title: "¡Es tuyo!", body: "Has fichado a Kike por 1.500.000 €.", href: "/equipo", unread: true });
  });
  test("a read row is not unread", () => {
    expect(inboxEntry({ id: 1, kind: "market_open", data: { count: 3 }, created_at: "2026-11-15T05:00:00Z", read_at: "2026-11-15T08:00:00Z" }).unread).toBe(false);
  });
});

describe("groupByDay", () => {
  const at = (iso: string, id: number): ActivityRow => ({ ...base, id, created_at: iso });
  const now = new Date("2026-11-15T12:00:00Z");

  test("groups by Madrid calendar day, newest day first, keeping the order inside a day", () => {
    const days = groupByDay([at("2026-11-15T08:00:00Z", 3), at("2026-11-15T05:00:00Z", 2), at("2026-11-14T20:00:00Z", 1)], now);
    expect(days.map((d) => [d.label, d.rows.map((r) => r.id)])).toEqual([["Hoy", [3, 2]], ["Ayer", [1]]]);
  });
  test("an older day is labelled with its weekday and date", () => {
    expect(groupByDay([at("2026-11-12T10:00:00Z", 1)], now)[0].label).toBe("jue, 12 nov");
  });
  test("the day boundary is Madrid midnight: 23:30Z in winter is already tomorrow there", () => {
    const days = groupByDay([at("2026-11-14T23:30:00Z", 1), at("2026-11-14T22:30:00Z", 2)], now);
    expect(days.map((d) => [d.label, d.rows.map((r) => r.id)])).toEqual([["Hoy", [1]], ["Ayer", [2]]]);
  });
  test("nothing in, nothing out", () => expect(groupByDay([], now)).toEqual([]));
});

describe("activity kinds", () => {
  test("each kind has its own short heading for the card", () => {
    expect(describeActivity({ ...base, kind: "signed" }).heading).toBe("Fichaje");
    expect(describeActivity({ ...base, kind: "sold" }).heading).toBe("Venta al mercado");
  });
});
