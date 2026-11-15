"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icons";
import { formatInt, formatMoney } from "@/lib/format";
import {
  FREE, GENDER_LABEL, colorLabel, filterAndSort, ownerOptions,
  type ColorChoice, type DirectoryRow, type DirectoryView, type Gender, type SortKey,
} from "@/services/player-directory";

type Column = { key: SortKey; label: string; hint: string; numeric?: boolean; firstDir: "asc" | "desc"; cell: (row: DirectoryRow, bothCategories: boolean) => React.ReactNode };

const TREND_ICON = { up: "trend-up", flat: "flat", down: "trend-down", none: "flat" } as const;
const TREND_LABEL = { up: "En alza", flat: "Estable", down: "A la baja", none: "Sin datos de forma todavía" } as const;
const ONE_DECIMAL = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const COLUMNS: Column[] = [
  { key: "name", label: "Nombre", hint: "Nombre del jugador en la liga", firstDir: "asc", cell: (r) => <td key="name" className="p-name">{r.name}</td> },
  { key: "color", label: "Color", hint: "Nivel en la liga", firstDir: "asc", cell: (r, both) => <td key="color"><span className={`chip color-${r.color} is-${r.gender}`}>{colorLabel(r, both)}</span></td> },
  { key: "value", label: "Valor de mercado", hint: "Valor de mercado", numeric: true, firstDir: "desc", cell: (r) => <td key="value" className="num">{formatMoney(r.value)}</td> },
  { key: "matches", label: "Partidos", hint: "Partidos jugados este semestre en la liga", numeric: true, firstDir: "desc", cell: (r) => <td key="matches" className="num">{formatInt(r.matches)}</td> },
  { key: "winRate", label: "Victorias", hint: "Porcentaje de partidos ganados en la liga", numeric: true, firstDir: "desc", cell: (r) => <td key="winRate" className="num">{Math.round(r.winRate * 100)}%</td> },
  { key: "called", label: "Convocatorias", hint: "Partidos jugados estando en la alineación de algún equipo a las 06:00", numeric: true, firstDir: "desc", cell: (r) => <td key="called" className="num">{r.called}</td> },
  { key: "points", label: "Puntos", hint: "Puntos de fantasy en los partidos importados", numeric: true, firstDir: "desc", cell: (r) => <td key="points" className="num">{r.points}</td> },
  { key: "average", label: "Media", hint: "Puntos por partido jugado en los partidos importados", numeric: true, firstDir: "desc", cell: (r) => <td key="average" className="num">{r.average === null ? "–" : ONE_DECIMAL.format(r.average)}</td> },
  { key: "trend", label: "Forma", hint: "Puntos de la última jornada (semana cerrada) frente a las tres anteriores", firstDir: "desc", cell: (r) => <td key="trend" className={`trend trend-${r.trend ?? "none"}`}><span aria-label={TREND_LABEL[r.trend ?? "none"]} title={TREND_LABEL[r.trend ?? "none"]}><Icon name={TREND_ICON[r.trend ?? "none"]} size={18} /></span></td> },
  { key: "owner", label: "Propietario", hint: "Equipo que tiene al jugador", firstDir: "asc", cell: (r) => <td key="owner" className={r.owner === null ? "p-owner is-free" : "p-owner"}>{r.owner ?? "Libre"}</td> },
];

const ALL_CATEGORIES = "all";
const RANKING_COLORS = ["Blanco", "Azul", "Verde", "Rosa", "Oro", "Granate", "Morado", "Marrón", "Plata", "Naranja"];
const colorRank = (color: string) => {
  const index = RANKING_COLORS.indexOf(color);
  return index === -1 ? RANKING_COLORS.length : index;
};
const GENDERS: Gender[] = ["male", "female"];
const ALL_OWNERS = "all";
const FREE_OPTION = "free";
const TEAM_PREFIX = "team:";

/** An euro amount typed in a filter box; empty or invalid means "no limit". */
function parseEuros(text: string): number | null {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** An extra last column that is not a player fact and not sortable, e.g. the bid form of the Mercado. */
export type ExtraColumn<T extends DirectoryRow> = { label: string; cell: (row: T) => React.ReactNode };

/**
 * The player table with its search, filters and sortable headers. `omit` hides columns (and the owner filter when
 * "owner" is omitted); `extra` appends a column of the caller's own, which is how the Mercado puts a bid control
 * on each row without a second table implementation.
 */
export function PlayersTable<T extends DirectoryRow = DirectoryRow>({ rows, omit = [], extra }: { rows: T[]; omit?: SortKey[]; extra?: ExtraColumn<T> }) {
  const columns = COLUMNS.filter((c) => !omit.includes(c.key));
  const showOwner = !omit.includes("owner");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [colors, setColors] = useState<ColorChoice[]>([]);
  const [ownerChoice, setOwnerChoice] = useState(ALL_OWNERS);
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const owners = useMemo(() => ownerOptions(rows), [rows]);
  const minValue = parseEuros(minText);
  const maxValue = parseEuros(maxText);
  const view: DirectoryView = {
    query, colors, gender: category === ALL_CATEGORIES ? null : (category as Gender), minValue, maxValue, sortKey, sortDir,
    owner: ownerChoice === ALL_OWNERS ? null : ownerChoice === FREE_OPTION ? FREE : ownerChoice.slice(TEAM_PREFIX.length),
  };
  const shown = useMemo(() => filterAndSort(rows, view), [rows, query, category, colors, ownerChoice, minValue, maxValue, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = query.trim() !== "" || category !== ALL_CATEGORIES || colors.length > 0 || (showOwner && ownerChoice !== ALL_OWNERS) || minValue !== null || maxValue !== null;
  const rangeIsEmpty = minValue !== null && maxValue !== null && minValue > maxValue;

  function sortBy(key: SortKey, firstDir: "asc" | "desc") {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(firstDir); }
  }
  // Both categories on screen: the table and the filter name the category ("Azul · Femenino").
  const bothCategories = new Set(shown.map((r) => r.gender)).size > 1;
  // The filter offers one chip per color and category only while the list can hold both; with one category chosen
  // (or only one in the data) a chip is just the color.
  const filterByCategory = category === ALL_CATEGORIES && new Set(rows.map((r) => r.gender)).size > 1;
  const colorChoices = useMemo(() => {
    const choices = new Map<string, ColorChoice>();
    for (const row of rows) {
      if (category !== ALL_CATEGORIES && row.gender !== category) continue;
      const gender = filterByCategory ? row.gender : undefined;
      choices.set(`${gender ?? ""}:${row.color}`, { color: row.color, gender });
    }
    return [...choices.values()].sort((a, b) => colorRank(a.color) - colorRank(b.color) || a.color.localeCompare(b.color, "es"));
  }, [rows, category, filterByCategory]);
  const same = (a: ColorChoice, b: ColorChoice) => a.color === b.color && a.gender === b.gender;
  function toggleColor(choice: ColorChoice) {
    setColors(colors.some((c) => same(c, choice)) ? colors.filter((c) => !same(c, choice)) : [...colors, choice]);
  }
  function chooseCategory(next: string) {
    setCategory(next);
    setColors([]); // the picks belonged to the other chip set
  }
  function clearFilters() {
    setQuery(""); setCategory(ALL_CATEGORIES); setColors([]); setOwnerChoice(ALL_OWNERS); setMinText(""); setMaxText("");
  }

  return (
    <div className="stack directory">
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field field-wide">
          <label htmlFor="player-search">Buscar por nombre</label>
          <input id="player-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kike, Álvaro…" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="player-category">Categoría</label>
          <select id="player-category" value={category} onChange={(e) => chooseCategory(e.target.value)}>
            <option value={ALL_CATEGORIES}>Todos</option>
            {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
          </select>
        </div>
        <fieldset className="field field-wide">
          <legend>Color</legend>
          <div className={filterByCategory ? "chips chips-by-category" : "chips"}>
            {filterByCategory && <><span>Masculino</span><span>Femenino</span></>}
            {colorChoices.map((choice) => (
              <button key={`${choice.gender ?? "any"}-${choice.color}`} type="button" aria-label={choice.gender ? `${choice.color} · ${GENDER_LABEL[choice.gender]}` : choice.color} className={`chip-toggle color-${choice.color}${choice.gender ? ` is-${choice.gender}` : ""}`} style={filterByCategory ? { gridColumn: choice.gender === "male" ? 1 : 2, gridRow: 2 + [...new Set(colorChoices.map((item) => item.color))].indexOf(choice.color) } : undefined} aria-pressed={colors.some((c) => same(c, choice))} onClick={() => toggleColor(choice)}>
                {choice.color}
              </button>
            ))}
          </div>
        </fieldset>
        {showOwner && <div className="field">
          <label htmlFor="player-owner">Propietario</label>
          <select id="player-owner" value={ownerChoice} onChange={(e) => setOwnerChoice(e.target.value)}>
            <option value={ALL_OWNERS}>Todos</option>
            <option value={FREE_OPTION}>Libre</option>
            {owners.map((name) => <option key={name} value={`${TEAM_PREFIX}${name}`}>{name}</option>)}
          </select>
        </div>}
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
              {columns.map((col) => (
                <th key={col.key} scope="col" title={col.hint} className={col.numeric ? "num" : undefined} aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="sort-button" onClick={() => sortBy(col.key, col.firstDir)}>
                    {col.label}
                    <span aria-hidden="true" className="sort-mark">{sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
              {extra && <th scope="col" className="p-extra-head">{extra.label}</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => <tr key={row.id}>{columns.map((col) => col.cell(row, bothCategories))}{extra && <td className="p-extra">{extra.cell(row)}</td>}</tr>)}
            {shown.length === 0 && (
              <tr><td colSpan={columns.length + (extra ? 1 : 0)} className="empty">Ningún jugador cumple esos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint table-note">
        Partidos y Victorias son de la liga este semestre. Convocatorias, Puntos y Media salen de los partidos importados en el fantasy;
        Convocatorias cuenta los que jugó estando en la alineación de algún equipo a las 06:00. <span className="swipe-hint">Desliza para ver todas las columnas.</span>
      </p>
    </div>
  );
}
