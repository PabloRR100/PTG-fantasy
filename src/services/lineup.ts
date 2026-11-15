/** All ten PTG levels, strongest first. Same order as the game_colors table (0009). */
export const COLORS = ["Blanco", "Azul", "Verde", "Rosa", "Oro", "Granate", "Morado", "Marrón", "Plata", "Naranja"] as const;
export type Color = (typeof COLORS)[number];

/**
 * The level the squad and lineup rules count by (game_colors.group_name, 0012): Azul and Blanco are one level, every
 * other color is its own. Colors stay what players are called in the catalog, the market and the filters.
 */
export const LEVELS: readonly { name: string; colors: readonly Color[] }[] = COLORS.reduce<{ name: string; colors: Color[] }[]>((levels, color) => {
  const name = color === "Blanco" || color === "Azul" ? "Azul y Blanco" : color;
  const existing = levels.find((l) => l.name === name);
  if (existing) existing.colors.push(color);
  else levels.push({ name, colors: [color] });
  return levels;
}, []);

export const levelOf = (color: string): string => (color === "Blanco" || color === "Azul" ? "Azul y Blanco" : color);

export type SquadPlayer = { id: string; color: Color };

const STARTERS_PER_COLOR = 2;

/**
 * Why a selection is not a valid lineup, in Spanish for the manager, or null when it is valid.
 * Advisory only: the `set_lineup` SQL function enforces the same rule and has the last word.
 */
export function lineupProblem(selected: string[], squad: SquadPlayer[]): string | null {
  const colorOf = new Map(squad.map((p) => [p.id, p.color]));
  if (selected.some((id) => !colorOf.has(id))) return "Hay un jugador que no está en tu plantilla.";

  for (const level of LEVELS) {
    const count = selected.filter((id) => levelOf(colorOf.get(id) ?? "") === level.name).length;
    if (count > STARTERS_PER_COLOR) return `Sobra gente en ${level.name}: elige solo ${STARTERS_PER_COLOR}.`;
    if (count < STARTERS_PER_COLOR) return `Faltan titulares en ${level.name}: elige ${STARTERS_PER_COLOR} (tienes ${count}).`;
  }
  return null;
}

/**
 * Selection after tapping a player. Tapping a selected player removes it; tapping a third of a
 * level drops the oldest selected of that level, so the manager swaps with one tap.
 */
export function toggleStarter(selected: string[], playerId: string, squad: SquadPlayer[]): string[] {
  if (selected.includes(playerId)) return selected.filter((id) => id !== playerId);

  const colorOf = new Map(squad.map((p) => [p.id, p.color]));
  const level = levelOf(colorOf.get(playerId) ?? "");
  const sameLevel = selected.filter((id) => levelOf(colorOf.get(id) ?? "") === level);
  const dropped = sameLevel.length >= STARTERS_PER_COLOR ? sameLevel[0] : null;
  return [...selected.filter((id) => id !== dropped), playerId];
}
