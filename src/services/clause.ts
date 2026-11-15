/** A release clause costs twice the player's market value. Mirrors pay_release_clause (migration 0014), which checks it. */
export const CLAUSE_MULTIPLIER = 2;

export function clausePrice(value: number): number {
  return value * CLAUSE_MULTIPLIER;
}
