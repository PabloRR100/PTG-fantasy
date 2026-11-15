/** What a squad is worth: the sum of its players' current market value, starters and bench alike. Cash budget is separate. */
export function squadValue(players: { value: number }[]): number {
  return players.reduce((sum, p) => sum + p.value, 0);
}

/**
 * Value of every team's squad, by user id. Teams with no squad rows are absent: the standings fill them in as 0.
 * Built from squads and players only, both readable by every signed-in user, so it exposes nothing private.
 */
export function teamValues(squads: { player_id: string; user_id: string }[], players: { id: string; value: number }[]): Map<string, number> {
  const valueOf = new Map(players.map((p) => [p.id, p.value]));
  const byTeam = new Map<string, number>();
  for (const s of squads) byTeam.set(s.user_id, (byTeam.get(s.user_id) ?? 0) + (valueOf.get(s.player_id) ?? 0));
  return byTeam;
}
