"use client";

import { useMemo, useState } from "react";
import { formatInt, formatMoney } from "@/lib/format";
import { COLORS, type Color } from "@/services/lineup";
import { FREE, filterAndSort, ownerOptions, type DirectoryRow, type DirectoryView, type SortKey } from "@/services/player-directory";

type Column = { key: SortKey; label: string; hint: string; numeric?: boolean; firstDir: "asc" | "desc"; cell: (row: DirectoryRow) => React.ReactNode };

const ONE_DECIMAL = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const COLUMNS: Column[] = [
  { key: "name", label: "Nombre", hint: "Nombre del jugador en PTG", firstDir: "asc", cell: (r) => <td key="name" className="p-name">{r.name}</td> },
  { key: "color", label: "Color", hint: "Nivel de PTG", firstDir: "asc", cell: (r) => <td key="color"><span className={`chip color-${r.color}`}>{r.color}</span></td> },
  { key: "value", label: "Valor", hint: "Valor de mercado", numeric: true, firstDir: "desc", cell: (r) => <td key="value" className="num">{formatMoney(r.value)}</td> },
  { key: "matches", label: "Partidos", hint: "Partidos jugados este semestre en PTG", numeric: true, firstDir: "desc", cell: (r) => <td key="matches" className="num">{formatInt(r.matches)}</td> },
  { key: "winRate", label: "Victorias", hint: "Porcentaje de partidos ganados en PTG", numeric: true, firstDir: "desc", cell: (r) => <td key="winRate" className="num">{Math.round(r.winRate * 100)}%</td> },
  { key: "called", label: "Convocatorias", hint: "Partidos jugados estando en la alineación de algún equipo a las 06:00", numeric: true, firstDir: "desc", cell: (r) => <td key="called" className="num">{r.called}</td> },
  { key: "points", label: "Puntos", hint: "Puntos de fantasy en los partidos importados", numeric: true, firstDir: "desc", cell: (r) => <td key="points" className="num">{r.points}</td> },
  { key: "average", label: "Media", hint: "Puntos por partido jugado en los partidos importados", numeric: true, firstDir: "desc", cell: (r) => <td key="average" className="num">{r.average === null ? "–" : ONE_DECIMAL.format(r.average)}</td> },
  { key: "owner", label: "Dueño", hint: "Equipo que tiene al jugador", firstDir: "asc", cell: (r) => <td key="owner" className={r.owner === null ? "p-owner is-free" : "p-owner"}>{r.owner ?? "Libre"}</td> },
];

const ALL_OWNERS = "all";
const FREE_OPTION = "free";
const TEAM_PREFIX = "team:";

/** An euro amount typed in a filter box; empty or invalid means "no limit". */
function parseEuros(text: string): number | null {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function PlayersTable({ rows }: { rows: DirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<Color[]>([]);
  const [ownerChoice, setOwnerChoice] = useState(ALL_OWNERS);
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const owners = useMemo(() => ownerOptions(rows), [rows]);
  const minValue = parseEuros(minText);
  const maxValue = parseEuros(maxText);
  const view: DirectoryView = {
    query, colors, minValue, maxValue, sortKey, sortDir,
    owner: ownerChoice === ALL_OWNERS ? null : ownerChoice === FREE_OPTION ? FREE : ownerChoice.slice(TEAM_PREFIX.length),
  };
  const shown = useMemo(() => filterAndSort(rows, view), [rows, query, colors, ownerChoice, minValue, maxValue, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = query.trim() !== "" || colors.length > 0 || ownerChoice !== ALL_OWNERS || minValue !== null || maxValue !== null;
  const rangeIsEmpty = minValue !== null && maxValue !== null && minValue > maxValue;

  function sortBy(key: SortKey, firstDir: "asc" | "desc") {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(firstDir); }
  }
  function toggleColor(color: Color) {
    setColors(colors.includes(color) ? colors.filter((c) => c !== color) : [...colors, color]);
  }
  function clearFilters() {
    setQuery(""); setColors([]); setOwnerChoice(ALL_OWNERS); setMinText(""); setMaxText("");
  }

  return (
    <div className="stack directory">
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field field-wide">
          <label htmlFor="player-search">Buscar por nombre</label>
          <input id="player-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kike, Álvaro…" autoComplete="off" />
        </div>
        <fieldset className="field field-wide">
          <legend>Color</legend>
          <div className="chips">
            {COLORS.map((color) => (
              <button key={color} type="button" className={`chip-toggle color-${color}`} aria-pressed={colors.includes(color)} onClick={() => toggleColor(color)}>
                {color}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="player-owner">Dueño</label>
          <select id="player-owner" value={ownerChoice} onChange={(e) => setOwnerChoice(e.target.value)}>
            <option value={ALL_OWNERS}>Todos</option>
            <option value={FREE_OPTION}>Libre</option>
            {owners.map((name) => <option key={name} value={`${TEAM_PREFIX}${name}`}>{name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="player-min">Valor mínimo (€)</label>
          <input id="player-min" type="number" inputMode="numeric" min={0} step={10000} value={minText} onChange={(e) => setMinText(e.target.value)} placeholder="Sin mínimo" />
        </div>
        <div className="field">
          <label htmlFor="player-max">Valor máximo (€)</label>
          <input id="player-max" type="number" inputMode="numeric" min={0} step={10000} value={maxText} onChange={(e) => setMaxText(e.target.value)} placeholder="Sin máximo" />
        </div>
      </form>

      <div className="table-status">
        <span role="status" aria-live="polite">{shown.length} de {rows.length} jugadores</span>
        {filtered && <button type="button" className="secondary" onClick={clearFilters}>Quitar filtros</button>}
      </div>
      {rangeIsEmpty && <p role="alert" className="msg msg-error">El valor mínimo es mayor que el máximo.</p>}

      <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla de jugadores">
        <table className="players">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} scope="col" title={col.hint} className={col.numeric ? "num" : undefined} aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="sort-button" onClick={() => sortBy(col.key, col.firstDir)}>
                    {col.label}
                    <span aria-hidden="true" className="sort-mark">{sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => <tr key={row.id}>{COLUMNS.map((col) => col.cell(row))}</tr>)}
            {shown.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="empty">Ningún jugador cumple esos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint table-note">
        Partidos y Victorias son de PTG este semestre. Convocatorias, Puntos y Media salen de los partidos importados en el fantasy;
        Convocatorias cuenta los que jugó estando en la alineación de algún equipo a las 06:00. <span className="swipe-hint">Desliza para ver todas las columnas.</span>
      </p>
    </div>
  );
}
