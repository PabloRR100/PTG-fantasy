// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ActivityFeed } from "@/components/ActivityFeed";
import { InboxList } from "@/components/InboxList";
import type { ActivityRow } from "@/services/feed";

vi.mock("@/app/actions", () => ({ markNotificationsRead: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-11-15T12:00:00Z");
const row = (r: Partial<ActivityRow> & Pick<ActivityRow, "id" | "kind">): ActivityRow => ({ team: "Los Pepros", avatar_url: null, player: "Kike", color: "Azul", gender: "female", amount: 1_500_000, created_at: "2026-11-15T09:00:00Z", ...r });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (node: React.ReactNode) => act(() => root.render(node));

describe("ActivityFeed running jornada", () => {
  test("labels the running week as in progress", () => {
    const live = { kind: "jornada" as const, id: "jornada-2026-11-09", weekStart: "2026-11-09", created_at: "2026-11-12T09:00:00Z", live: true, entries: [
      { user_id: "a", team: "Alfa", avatar_url: null, points: 12, rank: 1, overallRank: 1, delta: 0 }] };
    render(<ActivityFeed now={new Date("2026-11-12T10:00:00Z")} rows={[]} jornadas={[live]} />);
    expect(host.querySelector(".jornada-kicker")?.textContent).toBe("Clasificación · en curso");
    expect(host.querySelector(".day-separator")?.textContent).toBe("Hoy");
  });
});

describe("ActivityFeed jornada card", () => {
  const e = (user_id: string, team: string, points: number, rank: number, overallRank: number, delta: number) => ({ user_id, team, avatar_url: null, points, rank, overallRank, delta });
  const jornada = (weekStart: string, created_at: string) => ({ kind: "jornada" as const, id: `jornada-${weekStart}`, weekStart, created_at, live: false, entries: [
    e("a", "Alfa", 40, 1, 2, -1), e("b", "Beta", 31, 2, 1, 1), e("c", "Gama", 20, 3, 3, 0), e("d", "Delta", 0, 4, 4, 0)] });

  test("the newest jornada opens with the whole table, each row with points, overall rank and movement", () => {
    render(<ActivityFeed now={new Date("2026-11-16T12:00:00Z")} rows={[row({ id: 1, kind: "signed", created_at: "2026-11-15T09:00:00Z" })]} jornadas={[jornada("2026-11-09", "2026-11-16T04:00:00Z")]} />);
    const card = host.querySelector(".feed-card-jornada")!;
    expect(card.textContent).toContain("Jornada 9 – 15 nov");
    expect(Array.from(card.querySelectorAll(".podium li")).map((li) => li.textContent)).toEqual([
      "1AAlfa40 pts#2↓1", "2BBeta31 pts#1↑1", "3GGama20 pts#3–", "4DDelta" + "N/P#4–"]);
    expect(card.querySelector("a")?.getAttribute("href")).toBe("/jornada?semana=2026-11-09");
    expect(host.querySelectorAll(".feed-card")).toHaveLength(2);
  });

  test("an older jornada shows only the podium until tapped", () => {
    render(<ActivityFeed now={new Date("2026-11-23T12:00:00Z")} rows={[]} jornadas={[jornada("2026-11-16", "2026-11-23T04:00:00Z"), jornada("2026-11-09", "2026-11-16T04:00:00Z")]} />);
    const [newest, older] = Array.from(host.querySelectorAll(".feed-card-jornada"));
    expect(newest.querySelectorAll(".podium li")).toHaveLength(4);
    expect(older.querySelectorAll(".podium li")).toHaveLength(3);
    expect(older.textContent).toContain("+1 más");
    act(() => (older.querySelector(".jornada-head") as HTMLButtonElement).click());
    expect(older.querySelectorAll(".podium li")).toHaveLength(4);
  });
});

describe("ActivityFeed", () => {
  test("splits the feed into days with a Hoy / Ayer separator, newest first", () => {
    render(<ActivityFeed now={NOW} rows={[row({ id: 3, kind: "signed" }), row({ id: 2, kind: "sold", created_at: "2026-11-15T05:30:00Z" }), row({ id: 1, kind: "signed", created_at: "2026-11-14T10:00:00Z" })]} />);
    expect(Array.from(host.querySelectorAll(".day-separator")).map((d) => d.textContent)).toEqual(["Hoy", "Ayer"]);
    expect(host.querySelectorAll(".day-group")[0].querySelectorAll("li")).toHaveLength(2);
    expect(host.querySelectorAll(".day-group")[1].querySelectorAll("li")).toHaveLength(1);
  });
  test("each kind is its own card: a signing and a sale look different and carry their heading and price", () => {
    render(<ActivityFeed now={NOW} rows={[row({ id: 2, kind: "sold", amount: 300_000 }), row({ id: 1, kind: "signed" })]} />);
    const cards = Array.from(host.querySelectorAll("li"));
    expect(cards[0].className).toContain("feed-card-sold");
    expect(cards[1].className).toContain("feed-card-signed");
    expect(cards[0].querySelector(".feed-kind")!.textContent).toBe("Venta al mercado");
    expect(cards[1].querySelector(".feed-kind")!.textContent).toBe("Fichaje");
    expect(cards[0].querySelector(".feed-amount")!.textContent).toBe("300.000 €");
    expect(cards[1].querySelector(".feed-amount")!.textContent).toBe("1.500.000 €");
    expect(cards[1].textContent).toContain("Los Pepros ha fichado a Kike");
  });
  test("shows the color chip with its category and the time, and the team's photo or initials", () => {
    render(<ActivityFeed now={NOW} rows={[row({ id: 1, kind: "signed", avatar_url: "https://lh3.googleusercontent.com/a/x" }), row({ id: 2, kind: "sold", team: "Gran Slam" })]} />);
    const chip = host.querySelector(".chip")!;
    expect(chip.textContent).toBe("Azul");
    expect(chip.getAttribute("title")).toBe("Femenino");
    expect(host.querySelector("time")!.textContent).toBe("hace 3 h");
    expect(host.querySelectorAll("li")[0].querySelector("img")!.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/x");
    expect(host.querySelectorAll("li")[1].querySelector(".avatar")!.textContent).toBe("GS"); // no photo: the team's initials
  });
  test("an empty league says what will show up", () => {
    render(<ActivityFeed rows={[]} />);
    expect(host.textContent).toMatch(/Todavía no hay movimientos/);
  });
});

describe("InboxList", () => {
  const entries = [
    { id: 2, title: "¡Es tuyo!", body: "Has fichado a Kike por 1.500.000 €.", href: "/equipo", created_at: "2026-11-15T09:00:00Z", unread: true },
    { id: 1, title: "Mercado abierto", body: "Hay 3 jugadores en subasta.", href: "/mercado", created_at: "2026-11-14T05:00:00Z", unread: false },
  ];
  test("marks unread entries, links each to its page and offers to mark them read", () => {
    render(<InboxList entries={entries} now={NOW} />);
    const items = host.querySelectorAll("li");
    expect(items[0].className).toContain("is-unread");
    expect(items[1].className).not.toContain("is-unread");
    expect(items[0].querySelector("a")!.getAttribute("href")).toBe("/equipo");
    expect(host.querySelector("button")!.textContent).toBe("Marcar la notificación como leída");
  });
  test("with nothing unread there is no button", () => {
    render(<InboxList entries={entries.map((e) => ({ ...e, unread: false }))} now={NOW} />);
    expect(host.querySelector("button")).toBeNull();
  });
  test("an empty inbox says what will arrive", () => {
    render(<InboxList entries={[]} />);
    expect(host.textContent).toMatch(/No tienes notificaciones/);
  });
});
