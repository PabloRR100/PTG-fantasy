// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MarketTable, type MarketRow } from "@/components/MarketTable";

vi.mock("@/app/actions", () => ({ placeBid: vi.fn(), closeMarket: vi.fn(), createTeam: vi.fn(), saveLineup: vi.fn(), sellPlayer: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rows: MarketRow[] = [
  { id: "a", listingId: "L1", myBid: null, gender: "male", name: "Kike", color: "Oro", value: 600_000, owner: null, matches: 3, winRate: 0.5, called: 0, points: 0, average: null, trend: null },
  { id: "b", listingId: "L2", myBid: 750_000, gender: "female", name: "Marta", color: "Naranja", value: 300_000, owner: null, matches: 1, winRate: 0.2, called: 0, points: 0, average: null, trend: "up" },
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); act(() => root.render(<MarketTable rows={rows} budget={5_000_000} />)); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("MarketTable", () => {
  test("one row per listing with the bid input and the Pujar button, including the new colors", () => {
    expect(Array.from(host.querySelectorAll("tbody td.p-name")).map((td) => td.textContent)).toEqual(["Kike", "Marta"]);
    expect(host.querySelectorAll('input[name="amount"]')).toHaveLength(2);
    expect(Array.from(host.querySelectorAll(".bid-form button")).map((b) => b.textContent)).toEqual(["Pujar", "Subir puja"]);
  });
  test("the input starts at the minimum bid, or at my current bid", () => {
    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>('input[name="amount"]'));
    expect(inputs.map((i) => i.value)).toEqual(["600000", "750000"]);
    expect(inputs.map((i) => i.min)).toEqual(["600000", "300000"]);
    expect(inputs.every((i) => i.max === "5000000")).toBe(true);
  });
  test("each form posts its own listing", () => {
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[name="listing"]')).map((i) => i.value)).toEqual(["L1", "L2"]);
  });
  test("no owner filter or personal-stat columns", () => {
    expect(host.querySelector("#player-owner")).toBeNull();
    expect(Array.from(host.querySelectorAll("thead th")).map((th) => th.textContent?.replace(/[▲▼]/g, ""))).toEqual(["Nombre", "Color", "Valor de mercado", "Partidos", "Victorias", "Forma", "Tu puja"]);
  });
});
