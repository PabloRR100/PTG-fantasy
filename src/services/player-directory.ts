import { COLORS, type Color } from "@/services/lineup";

/** One player as the directory shows it. `owner` is the team's public name, never an account id; null = free. */
export type DirectoryRow = {
  id: string;
  name: string;
  color: Color;
  value: number;
  owner: string | null;
  /** Matches played in PTG this semester (from PTG's ranking). */
  matches: number;
  /** PTG win ratio, 0 to 1. */
  winRate: number;
  /** Matches played while in some team's lineup (see player-stats.ts). */
  called: number;
  /** Fantasy points over the imported matches. */
  points: number;
  /** Points per imported match played; null when the player has none. */
  average: number | null;
};

export type SortKey = "name" | "color" | "value" | "owner" | "matches" | "winRate" | "called" | "points" | "average";

/** The owner filter's "Libre" option. A symbol, so no team name can ever be mistaken for it. */
export const FREE = Symbol("free");

export type DirectoryView = {
  query: string;
  colors: Color[];
  owner: string | typeof FREE | null;
  minValue: number | null;
  maxValue: number | null;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
};

const collator = new Intl.Collator("es", { sensitivity: "base" });

/** Lowercase with accents removed, so "alvaro" finds "Álvaro". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const levelOf = (color: Color) => COLORS.indexOf(color);

function compare(a: DirectoryRow, b: DirectoryRow, key: SortKey): number {
  switch (key) {
    case "name":
      return collator.compare(a.name, b.name);
    case "color":
      return levelOf(a.color) - levelOf(b.color);
    case "value":
      return a.value - b.value;
    case "matches":
      return a.matches - b.matches;
    case "winRate":
      return a.winRate - b.winRate;
    case "called":
      return a.called - b.called;
    case "points":
      return a.points - b.points;
    case "average":
      return (a.average ?? 0) - (b.average ?? 0);
    case "owner":
      // Free players sort after every team when ascending.
      if (a.owner === null || b.owner === null) return a.owner === b.owner ? 0 : a.owner === null ? 1 : -1;
      return collator.compare(a.owner, b.owner);
  }
}

/** Rows that pass every filter, ordered by the chosen column; ties fall back to name, then level. */
export function filterAndSort(rows: DirectoryRow[], view: DirectoryView): DirectoryRow[] {
  const query = fold(view.query.trim());
  const direction = view.sortDir === "asc" ? 1 : -1;

  return rows
    .filter((row) => {
      if (query && !fold(row.name).includes(query)) return false;
      if (view.colors.length > 0 && !view.colors.includes(row.color)) return false;
      if (view.owner === FREE ? row.owner !== null : view.owner !== null && row.owner !== view.owner) return false;
      if (view.minValue !== null && row.value < view.minValue) return false;
      if (view.maxValue !== null && row.value > view.maxValue) return false;
      return true;
    })
    .sort((a, b) => {
      // A player with no matches has no average: last, whichever way the column is sorted.
      if (view.sortKey === "average" && (a.average === null || b.average === null) && a.average !== b.average) {
        return a.average === null ? 1 : -1;
      }
      return direction * compare(a, b, view.sortKey) || collator.compare(a.name, b.name) || levelOf(a.color) - levelOf(b.color);
    });
}

/** Team names for the owner filter: only teams that own someone, alphabetical, without repeats. */
export function ownerOptions(rows: DirectoryRow[]): string[] {
  const names = new Set(rows.flatMap((r) => (r.owner === null ? [] : [r.owner])));
  return [...names].sort(collator.compare);
}
