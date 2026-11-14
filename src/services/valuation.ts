export type Color = "Blanco" | "Azul" | "Verde" | "Rosa";

const BASE_VALUE: Record<Color, number> = {
  Blanco: 2_000_000,
  Azul: 1_500_000,
  Verde: 1_000_000,
  Rosa: 700_000,
};

const MAX_DAILY_MOVE = 0.1;

const round10k = (n: number) => Math.round(n / 10_000) * 10_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** First market value from PTG data: color base, scaled by win ratio and by how much they play. */
export function initialValue(p: { color: Color; ratio: number; matchesPlayed: number }): number {
  const experience = Math.min(1, 0.5 + p.matchesPlayed / 100);
  return round10k(BASE_VALUE[p.color] * (0.5 + p.ratio) * experience);
}

/** Daily move: recent points against the player's own baseline, at most 10% either way. */
export function nextValue(current: number, recentPoints: number, baselinePoints: number): number {
  const form = (recentPoints - baselinePoints) / Math.max(baselinePoints, 1);
  return round10k(current * (1 + clamp(form, -MAX_DAILY_MOVE, MAX_DAILY_MOVE)));
}
