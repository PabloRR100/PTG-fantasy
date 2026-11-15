// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { StandingsTable } from "@/components/StandingsTable";
import type { StandingRow } from "@/services/standings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (r: Partial<StandingRow> & Pick<StandingRow, "user_id" | "team_name">): StandingRow => ({ total: 0, week: 0, rank: 1, teamValue: 0, avatar_url: null, ...r });
const rows: StandingRow[] = [
  row({ user_id: "a", team_name: "Los Pepros", total: 50, week: 20, rank: 1, teamValue: 14_480_000, avatar_url: "https://lh3.googleusercontent.com/a/x=s96-c" }),
  row({ user_id: "b", team_name: "Gran Slam", total: 15, week: 15, rank: 2, teamValue: 0 }),
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<StandingsTable rows={rows} myUserId="b" />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const cells = (n: number) => Array.from(host.querySelectorAll(`tbody tr td:nth-child(${n})`));

describe("StandingsTable", () => {
  test("keeps rank, team, week, total and the team value, in that order", () => {
    expect(Array.from(host.querySelectorAll("thead th")).map((th) => th.textContent)).toEqual(["#", "Equipo", "Semana", "Total", "Valor del equipo"]);
    expect(cells(5).map((c) => c.textContent)).toEqual(["14.480.000 €", "0 €"]);
  });

  test("shows the participant's photo next to the team name", () => {
    const img = cells(2)[0].querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/x=s96-c");
    expect(img.getAttribute("alt")).toBe(""); // decorative: the team name beside it is the label
    expect(cells(2)[0].textContent).toBe("Los Pepros");
  });

  test("without a photo it shows the team's initials", () => {
    expect(cells(2)[1].querySelector("img")).toBeNull();
    expect(cells(2)[1].querySelector(".avatar")!.textContent).toBe("GS");
    expect(cells(2)[1].textContent).toBe("GSGran Slam");
  });

  test("a photo that fails to load falls back to the initials", () => {
    act(() => { cells(2)[0].querySelector("img")!.dispatchEvent(new Event("error")); });
    expect(cells(2)[0].querySelector("img")).toBeNull();
    expect(cells(2)[0].querySelector(".avatar")!.textContent).toBe("LP");
  });

  test("marks the signed-in user's own row", () => {
    expect(host.querySelector("tbody tr.me td:nth-child(2)")!.textContent).toContain("Gran Slam");
  });
});
