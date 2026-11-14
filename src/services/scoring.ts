export type SetResult = { mine: number; theirs: number };
export type MatchInput = { sets: SetResult[]; walkover: boolean };
export type MatchScore = {
  played: boolean;
  won: boolean;
  setsWon: number;
  setsLost: number;
  points: number;
};

const POINTS_PLAYED = 2;
const POINTS_WON = 4;

/** Points one player earns in one match. Rules: docs/GAMEPLAY.md section 4. */
export function scoreMatch({ sets, walkover }: MatchInput): MatchScore {
  if (walkover) {
    return { played: false, won: false, setsWon: 0, setsLost: 0, points: 0 };
  }
  const setsWon = sets.filter((s) => s.mine > s.theirs).length;
  const setsLost = sets.filter((s) => s.mine < s.theirs).length;
  const won = setsWon > setsLost;
  const points = Math.max(0, POINTS_PLAYED + (won ? POINTS_WON : 0) + setsWon - setsLost);
  return { played: true, won, setsWon, setsLost, points };
}
