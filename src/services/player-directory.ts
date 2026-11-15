import { COLORS } from "@/services/lineup";
import type { Trend } from "@/services/form";

/** One player as the directory shows it. `owner` is the team's public name, never an account id; null = free. */
export type Gender = "male" | "female";

export const GENDER_LABEL: Record<Gender, string> = { male: "Masculino", female: "Femenino" };

/** A color the filter can pick. Without a gender it means that color in either category. */
export type ColorChoice = { color: string; gender?: Gender };

/** "Azul · Femenino" when both categories are on screen, plain "Azul" otherwise. */
export function colorLabel(row: { color: string; gender: Gender }, bothCategories: boolean): string {
  return bothCategories ? `${row.color} · ${GENDER_LABEL[row.gender]}` : row.color;
}

export type DirectoryRow = {
  id: string;
  name: string;
  /** PTG ranks men and women in separate groups of the same color: the same color name, two categories. */
  gender: Gender;
  color: string;
  value: number;
  owner: string | null;
  /** What the owner added on top of the clause floor (squads.clause_extra); 0 when free. */
  clauseExtra: number;
  /** The owner just signed him: no clause can be paid before this instant (squads.protected_until); null = not protected. */
  protectedUntil: string | null;
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
  /** Momento de forma: latest closed week against the weeks before (src/services/form.ts); null without history. */
  trend: Trend | null;
};

export type SortKey = "name" | "color" | "value" | "owner" | "matches" | "winRate" | "called" | "points" | "average" | "trend";

/** The owner filter's "Libre" option. A symbol, so no team name can ever be mistaken for it. */
export const FREE = Symbol("free");

export type DirectoryView = {
  query: string;
  /** null = Todos. */
  gender: Gender | null;
  colors: ColorChoice[];
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

const levelOf = (color: string) => {
  const index = COLORS.findIndex((level) => level === color);
  return index === -1 ? COLORS.length : index;
};

/** No history sorts below a falling player. */
const trendRank = (t: Trend | null) => (t === "up" ? 3 : t === "flat" ? 2 : t === "down" ? 1 : 0);

function compare(a: DirectoryRow, b: DirectoryRow, key: SortKey): number {
  switch (key) {
    case "name":
      return collator.compare(a.name, b.name);
    case "color":
      return levelOf(a.color) - levelOf(b.color) || collator.compare(a.color, b.color) || (a.gender === b.gender ? 0 : a.gender === "male" ? -1 : 1);
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
    case "trend":
      return trendRank(a.trend) - trendRank(b.trend);
    case "owner":
      // Free players sort after every team when ascending.
      if (a.owner === null || b.owner === null) return a.owner === b.owner ? 0 : a.owner === null ? 1 : -1;
      return collator.compare(a.owner, b.owner);
  }
}

/** Rows that pass every filter, ordered by the chosen column; ties fall back to name, then level. */
export function filterAndSort<T extends DirectoryRow>(rows: T[], view: DirectoryView): T[] {
  const query = fold(view.query.trim());
  const direction = view.sortDir === "asc" ? 1 : -1;

  return rows
    .filter((row) => {
      if (query && !fold(row.name).includes(query)) return false;
      if (view.gender !== null && row.gender !== view.gender) return false;
      if (view.colors.length > 0 && !view.colors.some((c) => c.color === row.color && (c.gender === undefined || c.gender === row.gender))) return false;
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
