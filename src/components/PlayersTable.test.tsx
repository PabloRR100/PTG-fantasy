// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PlayersTable } from "@/components/PlayersTable";
import type { DirectoryRow } from "@/services/player-directory";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rows: DirectoryRow[] = [
  { gender: "male", id: "p1", name: "Kike", color: "Blanco", value: 2_000_000, owner: "Los Pepros", clauseExtra: 0, matches: 1280, winRate: 0.55, called: 4, points: 40, average: 5, trend: null },
  { gender: "male", id: "p2", name: "Álvaro Born", color: "Blanco", value: 1_700_000, owner: null, clauseExtra: 0, matches: 240, winRate: 0.57, called: 0, points: 21, average: 7, trend: null },
  { gender: "male", id: "p3", name: "Edu Laviña", color: "Azul", value: 1_500_000, owner: "Gamma", clauseExtra: 0, matches: 225, winRate: 0.48, called: 2, points: 6, average: 3, trend: null },
  { gender: "male", id: "p4", name: "Mario", color: "Verde", value: 900_000, owner: null, clauseExtra: 0, matches: 30, winRate: 0.7, called: 1, points: 0, average: null, trend: null },
  { gender: "male", id: "p5", name: "Mario", color: "Rosa", value: 300_000, owner: "Los Pepros", clauseExtra: 0, matches: 12, winRate: 0.2, called: 0, points: 12, average: 4.25, trend: null },
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
    expect(Array.from(host.querySelectorAll("thead th")).map((th) => th.textContent?.replace(/[▲▼]/g, ""))).toEqual(["Nombre", "Color", "Valor de mercado", "Partidos", "Victorias", "Convocatorias", "Puntos", "Media", "Forma", "Propietario"]);
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
    const chip = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>(".chip-toggle")).find((b) => b.getAttribute("aria-label") === label)!;
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
    expect(header("Valor de mercado").getAttribute("aria-sort")).toBe("none");
  });

  test("sorting by value starts descending, then ascending", () => {
    click(header("Color").querySelector("button")!); // leave the default
    click(header("Valor de mercado").querySelector("button")!);
    expect(header("Valor de mercado").getAttribute("aria-sort")).toBe("descending");
    click(header("Valor de mercado").querySelector("button")!);
    expect(names()[0]).toBe("Mario"); // 300.000 €, the cheapest
    expect(header("Valor de mercado").getAttribute("aria-sort")).toBe("ascending");
  });

  test("sorting by owner puts free players last; sorting keeps the active filters", () => {
    click(header("Propietario").querySelector("button")!);
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

  test("shows league matches and win rate, the fantasy convocatorias, points and average", () => {
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
    expect(header("Valor de mercado").getAttribute("title")).toBe("Valor de mercado");
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
    expect(host.textContent).toMatch(/Partidos y Victorias son de la liga/);
    expect(host.textContent).toMatch(/Convocatorias, Puntos y Media salen de los partidos importados/);
  });
});

describe("PlayersTable categories", () => {
  const mixed: DirectoryRow[] = [
    { id: "m1", gender: "male", name: "Aitor", color: "Azul", value: 900_000, owner: null, clauseExtra: 0, matches: 1, winRate: 0.5, called: 0, points: 0, average: null, trend: null },
    { id: "f1", gender: "female", name: "Marta", color: "Azul", value: 800_000, owner: null, clauseExtra: 0, matches: 1, winRate: 0.5, called: 0, points: 0, average: null, trend: null },
    { id: "f2", gender: "female", name: "Nuria", color: "Rosa", value: 700_000, owner: "Gamma", clauseExtra: 0, matches: 1, winRate: 0.5, called: 0, points: 0, average: null, trend: null },
  ];
  const render = () => { act(() => root.render(<PlayersTable rows={mixed} />)); };
  const colorCells = () => Array.from(host.querySelectorAll("tbody tr td:nth-child(2)")).map((td) => td.textContent);
  const chips = () => Array.from(host.querySelectorAll<HTMLButtonElement>(".chip-toggle")).map((b) => b.getAttribute("aria-label"));
  const chip = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>(".chip-toggle")).find((b) => b.getAttribute("aria-label") === label)!;

  test("offers Todos, Masculino and Femenino, starting on Todos", () => {
    render();
    const select = $<HTMLSelectElement>("#player-category");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Todos", "Masculino", "Femenino"]);
    expect(select.value).toBe("all");
  });

  test("seen together, the table and the color filter name the category", () => {
    render();
    expect(colorCells()).toEqual(["Azul · Masculino", "Azul · Femenino", "Rosa · Femenino"]);
    expect(chips()).toEqual(expect.arrayContaining(["Azul · Masculino", "Azul · Femenino", "Rosa · Femenino"]));
    expect(chips()).toHaveLength(3);
  });

  test("one category at a time: plain names for available colors", () => {
    render();
    type($("#player-category"), "female");
    expect(names()).toEqual(["Marta", "Nuria"]);
    expect(colorCells()).toEqual(["Azul", "Rosa"]);
    expect(chips()).toEqual(["Azul", "Rosa"]);
    type($("#player-category"), "male");
    expect(names()).toEqual(["Aitor"]);
  });

  test("a category and a color combine, and a color variant picks just its category", () => {
    render();
    click(chip("Azul · Femenino"));
    expect(names()).toEqual(["Marta"]);
    type($("#player-category"), "all");
    type($("#player-category"), "female");
    click(chip("Azul"));
    expect(names()).toEqual(["Marta"]);
    click(chip("Azul"));
    click(chip("Rosa"));
    expect(names()).toEqual(["Nuria"]);
  });

  test("changing category clears the color picks (they belonged to the other chip set) and Quitar filtros resets it", () => {
    render();
    click(chip("Azul · Masculino"));
    type($("#player-category"), "female");
    expect(chip("Azul").getAttribute("aria-pressed")).toBe("false");
    expect(names()).toEqual(["Marta", "Nuria"]);
    const clear = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Quitar filtros")!;
    click(clear);
    expect($<HTMLSelectElement>("#player-category").value).toBe("all");
    expect(names()).toHaveLength(3);
  });

  test("rows of one category only never show the suffix, even on Todos", () => {
    act(() => root.render(<PlayersTable rows={mixed.filter((r) => r.gender === "female")} />));
    expect(colorCells()).toEqual(["Azul", "Rosa"]);
    expect(chips()).toEqual(["Azul", "Rosa"]);
  });
});

describe("PlayersTable form column", () => {
  const withTrend: DirectoryRow[] = [
    { id: "a", gender: "male", name: "Sube", color: "Azul", value: 3, owner: null, clauseExtra: 0, matches: 1, winRate: 0.5, called: 0, points: 9, average: 9, trend: "up" },
    { id: "b", gender: "male", name: "Baja", color: "Azul", value: 2, owner: null, clauseExtra: 0, matches: 1, winRate: 0.5, called: 0, points: 1, average: 1, trend: "down" },
    { id: "c", gender: "male", name: "Nuevo", color: "Azul", value: 1, owner: null, clauseExtra: 0, matches: 0, winRate: 0, called: 0, points: 0, average: null, trend: null },
  ];
  test("shows an arrow per player and a dash when there is no history, each with a spoken label", () => {
    act(() => root.render(<PlayersTable rows={withTrend} />));
    expect(Array.from(host.querySelectorAll("td.trend svg")).map((s) => s.getAttribute("class"))).toEqual(["icon icon-trend-up", "icon icon-trend-down", "icon icon-flat"]);
    expect(Array.from(host.querySelectorAll("td.trend span")).map((s) => s.getAttribute("aria-label"))).toEqual(["En alza", "A la baja", "Sin datos de forma todavía"]);
  });
  test("sorts by form: rising first, then falling, then no data", () => {
    act(() => root.render(<PlayersTable rows={withTrend} />));
    click(header("Forma").querySelector("button")!);
    expect(names()).toEqual(["Sube", "Baja", "Nuevo"]);
    click(header("Forma").querySelector("button")!);
    expect(names()).toEqual(["Nuevo", "Baja", "Sube"]);
  });
});

describe("PlayersTable as the Mercado table", () => {
  const listed = [
    { id: "a", gender: "male", name: "Kike", color: "Blanco", value: 2_000_000, owner: null, clauseExtra: 0, matches: 10, winRate: 0.5, called: 0, points: 0, average: null, trend: "up" },
    { id: "b", gender: "female", name: "Marta", color: "Azul", value: 1_000_000, owner: null, clauseExtra: 0, matches: 5, winRate: 0.4, called: 0, points: 0, average: null, trend: null },
  ] as DirectoryRow[];
  const market = (props: Partial<React.ComponentProps<typeof PlayersTable>> = {}) =>
    act(() => root.render(<PlayersTable rows={listed} omit={["owner", "called", "points", "average"]} extra={{ label: "Tu puja", cell: (r) => <button type="button" data-bid={r.id}>Pujar</button> }} {...props} />));
  const heads = () => Array.from(host.querySelectorAll("thead th")).map((th) => th.textContent?.replace(/[▲▼]/g, ""));

  test("leaves out the columns that make no sense for a free player and ends with the bid column", () => {
    market();
    expect(heads()).toEqual(["Nombre", "Color", "Valor de mercado", "Partidos", "Victorias", "Forma", "Tu puja"]);
  });
  test("each row carries its own bid control", () => {
    market();
    expect(Array.from(host.querySelectorAll("button[data-bid]")).map((b) => b.getAttribute("data-bid"))).toEqual(["a", "b"]);
  });
  test("the owner filter is hidden when the owner column is", () => {
    market();
    expect(host.querySelector("#player-owner")).toBeNull();
  });
  test("search, category, color and sorting still work, and the bid control follows its row", () => {
    market();
    type($("#player-search"), "mar");
    expect(names()).toEqual(["Marta"]);
    expect(host.querySelector("button[data-bid]")!.getAttribute("data-bid")).toBe("b");
    type($("#player-search"), "");
    type($("#player-category"), "female");
    expect(names()).toEqual(["Marta"]);
    type($("#player-category"), "all");
    click(header("Valor de mercado").querySelector("button")!); // already sorted by value, descending: one click flips it
    expect(names()).toEqual(["Marta", "Kike"]);
  });
  test("the extra column is not sortable", () => {
    market();
    expect(header("Tu puja").querySelector("button")).toBeNull();
  });
  test("the empty message spans every column, the extra one too", () => {
    market();
    type($("#player-search"), "zzz");
    expect(host.querySelector("td.empty")!.getAttribute("colspan")).toBe("7");
  });
});
