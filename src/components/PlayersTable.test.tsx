// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PlayersTable } from "@/components/PlayersTable";
import type { DirectoryRow } from "@/services/player-directory";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rows: DirectoryRow[] = [
  { id: "p1", name: "Kike", color: "Blanco", value: 2_000_000, owner: "Los Pepros", matches: 1280, winRate: 0.55, called: 4, points: 40, average: 5 },
  { id: "p2", name: "Álvaro Born", color: "Blanco", value: 1_700_000, owner: null, matches: 240, winRate: 0.57, called: 0, points: 21, average: 7 },
  { id: "p3", name: "Edu Laviña", color: "Azul", value: 1_500_000, owner: "Gamma", matches: 225, winRate: 0.48, called: 2, points: 6, average: 3 },
  { id: "p4", name: "Mario", color: "Verde", value: 900_000, owner: null, matches: 30, winRate: 0.7, called: 1, points: 0, average: null },
  { id: "p5", name: "Mario", color: "Rosa", value: 300_000, owner: "Los Pepros", matches: 12, winRate: 0.2, called: 0, points: 12, average: 4.25 },
];

let host: HTMLDivElement;
let root: Root;
const $ = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
const names = () => Array.from(host.querySelectorAll("tbody tr td.p-name")).map((td) => td.textContent);
const owners = () => Array.from(host.querySelectorAll("tbody tr td.p-owner")).map((td) => td.textContent);
const column = (n: number) => Array.from(host.querySelectorAll(`tbody tr td:nth-child(${n})`)).map((td) => td.textContent);

function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const click = (el: HTMLElement) => act(() => el.click());
const header = (label: string) => Array.from(host.querySelectorAll<HTMLElement>("thead th")).find((th) => th.textContent?.includes(label))!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<PlayersTable rows={rows} />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("PlayersTable", () => {
  test("shows the four columns and every player, most valuable first", () => {
    expect(Array.from(host.querySelectorAll("thead th")).map((th) => th.textContent?.replace(/[▲▼]/g, ""))).toEqual(["Nombre", "Color", "Valor", "Partidos", "Victorias", "Convocatorias", "Puntos", "Media", "Dueño"]);
    expect(names()).toEqual(["Kike", "Álvaro Born", "Edu Laviña", "Mario", "Mario"]);
    expect(host.textContent).toContain("5 de 5 jugadores");
  });

  test("shows the team's public name, and Libre for free players", () => {
    expect(owners()).toEqual(["Los Pepros", "Libre", "Gamma", "Libre", "Los Pepros"]);
  });

  test("renders no account ids or emails", () => {
    expect(host.innerHTML).not.toMatch(/@|user_id|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  test("search by name ignores case and accents", () => {
    type($("#player-search"), "alvaro");
    expect(names()).toEqual(["Álvaro Born"]);
    expect(host.textContent).toContain("1 de 5 jugadores");
  });

  test("color chips filter, combine, and report their state", () => {
    const chip = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>(".chip-toggle")).find((b) => b.textContent === label)!;
    click(chip("Blanco"));
    expect(chip("Blanco").getAttribute("aria-pressed")).toBe("true");
    expect(names()).toEqual(["Kike", "Álvaro Born"]);
    click(chip("Rosa"));
    expect(names()).toEqual(["Kike", "Álvaro Born", "Mario"]);
    click(chip("Blanco"));
    expect(names()).toEqual(["Mario"]);
  });

  test("owner filter: a team, then Libre, then everyone", () => {
    type($("#player-owner"), "team:Gamma");
    expect(names()).toEqual(["Edu Laviña"]);
    type($("#player-owner"), "free");
    expect(names()).toEqual(["Álvaro Born", "Mario"]);
    expect(owners()).toEqual(["Libre", "Libre"]);
    type($("#player-owner"), "all");
    expect(names()).toHaveLength(5);
  });

  test("the owner list offers only team names, and Libre", () => {
    const labels = Array.from(host.querySelectorAll("#player-owner option")).map((o) => o.textContent);
    expect(labels).toEqual(["Todos", "Libre", "Gamma", "Los Pepros"]);
  });

  test("value range, both ends inclusive; clearing a box removes that limit", () => {
    type($("#player-min"), "900000");
    type($("#player-max"), "1700000");
    expect(names()).toEqual(["Álvaro Born", "Edu Laviña", "Mario"]);
    type($("#player-max"), "");
    expect(names()).toEqual(["Kike", "Álvaro Born", "Edu Laviña", "Mario"]);
  });

  test("a minimum above the maximum says so instead of silently showing nothing", () => {
    type($("#player-min"), "2000000");
    type($("#player-max"), "1000000");
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/mínimo es mayor/);
    expect(host.textContent).toContain("Ningún jugador cumple esos filtros.");
  });

  test("sorting: first click uses the natural direction, second reverses, aria-sort follows", () => {
    click(header("Nombre").querySelector("button")!);
    expect(header("Nombre").getAttribute("aria-sort")).toBe("ascending");
    expect(names()).toEqual(["Álvaro Born", "Edu Laviña", "Kike", "Mario", "Mario"]);
    click(header("Nombre").querySelector("button")!);
    expect(header("Nombre").getAttribute("aria-sort")).toBe("descending");
    expect(names()[0]).toBe("Mario");
    expect(header("Valor").getAttribute("aria-sort")).toBe("none");
  });

  test("sorting by value starts descending, then ascending", () => {
    click(header("Color").querySelector("button")!); // leave the default
    click(header("Valor").querySelector("button")!);
    expect(header("Valor").getAttribute("aria-sort")).toBe("descending");
    click(header("Valor").querySelector("button")!);
    expect(names()[0]).toBe("Mario"); // 300.000 €, the cheapest
    expect(header("Valor").getAttribute("aria-sort")).toBe("ascending");
  });

  test("sorting by owner puts free players last; sorting keeps the active filters", () => {
    click(header("Dueño").querySelector("button")!);
    expect(owners()).toEqual(["Gamma", "Los Pepros", "Los Pepros", "Libre", "Libre"]);
    type($("#player-search"), "mario");
    expect(owners()).toEqual(["Los Pepros", "Libre"]);
  });

  test("Quitar filtros resets everything and only appears when something is filtered", () => {
    expect(host.textContent).not.toContain("Quitar filtros");
    type($("#player-search"), "kike");
    type($("#player-owner"), "team:Los Pepros");
    click(Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Quitar filtros")!);
    expect(names()).toHaveLength(5);
    expect($<HTMLInputElement>("#player-search").value).toBe("");
    expect(host.textContent).not.toContain("Quitar filtros");
  });

  test("shows PTG matches and win rate, the fantasy convocatorias, points and average", () => {
    expect(column(4)).toEqual(["1.280", "240", "225", "30", "12"]);
    expect(column(5)).toEqual(["55%", "57%", "48%", "70%", "20%"]);
    expect(column(6)).toEqual(["4", "0", "2", "1", "0"]);
    expect(column(7)).toEqual(["40", "21", "6", "0", "12"]);
  });

  test("the average has one decimal with a comma, and a dash when the player has no matches", () => {
    expect(column(8)).toEqual(["5,0", "7,0", "3,0", "–", "4,3"]);
  });

  test("each header explains itself", () => {
    expect(header("Convocatorias").getAttribute("title")).toMatch(/alineación de algún equipo a las 06:00/);
    expect(header("Valor").getAttribute("title")).toBe("Valor de mercado");
  });

  test("sorting by the new columns, biggest first on the first click", () => {
    click(header("Convocatorias").querySelector("button")!);
    expect(names()).toEqual(["Kike", "Edu Laviña", "Mario", "Álvaro Born", "Mario"]);
    expect(header("Convocatorias").getAttribute("aria-sort")).toBe("descending");
    click(header("Victorias").querySelector("button")!);
    expect(column(5)).toEqual(["70%", "57%", "55%", "48%", "20%"]);
    click(header("Partidos").querySelector("button")!);
    expect(column(4)[0]).toBe("1.280");
  });

  test("sorting by the average keeps players without matches at the bottom both ways", () => {
    click(header("Media").querySelector("button")!);
    expect(column(8).at(-1)).toBe("–");
    click(header("Media").querySelector("button")!);
    expect(column(8).at(-1)).toBe("–");
    expect(column(8)[0]).toBe("3,0");
  });

  test("a footnote says where each number comes from", () => {
    expect(host.textContent).toMatch(/Partidos y Victorias son de PTG/);
    expect(host.textContent).toMatch(/Convocatorias, Puntos y Media salen de los partidos importados/);
  });
});
