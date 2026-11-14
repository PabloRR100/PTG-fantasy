export const COLORS = ["Blanco", "Azul", "Verde", "Rosa"] as const;
export type Color = (typeof COLORS)[number];

export type SquadPlayer = { id: string; color: Color };

const STARTERS_PER_COLOR = 2;

/**
 * Why a selection is not a valid lineup, in Spanish for the manager, or null when it is valid.
 * Advisory only: the `set_lineup` SQL function enforces the same rule and has the last word.
 */
export function lineupProblem(selected: string[], squad: SquadPlayer[]): string | null {
  const colorOf = new Map(squad.map((p) => [p.id, p.color]));
  if (selected.some((id) => !colorOf.has(id))) return "Hay un jugador que no está en tu plantilla.";

  for (const color of COLORS) {
    const count = selected.filter((id) => colorOf.get(id) === color).length;
    if (count > STARTERS_PER_COLOR) return `Sobra gente en ${color}: elige solo ${STARTERS_PER_COLOR}.`;
    if (count < STARTERS_PER_COLOR) return `Faltan titulares en ${color}: elige ${STARTERS_PER_COLOR} (tienes ${count}).`;
  }
  return null;
}

/**
 * Selection after tapping a player. Tapping a selected player removes it; tapping a third of a
 * color drops the oldest selected of that color, so the manager swaps with one tap.
 */
export function toggleStarter(selected: string[], playerId: string, squad: SquadPlayer[]): string[] {
  if (selected.includes(playerId)) return selected.filter((id) => id !== playerId);

  const colorOf = new Map(squad.map((p) => [p.id, p.color]));
  const color = colorOf.get(playerId);
  const sameColor = selected.filter((id) => colorOf.get(id) === color);
  const dropped = sameColor.length >= STARTERS_PER_COLOR ? sameColor[0] : null;
  return [...selected.filter((id) => id !== dropped), playerId];
}
