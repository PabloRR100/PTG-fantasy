export type TeamRow = { user_id: string; team_name: string; avatar_url?: string | null };
export type CyclePointsRow = { user_id: string; cycle_date: string; points: number };
export type StandingRow = TeamRow & { total: number; week: number; rank: number; teamValue: number; avatar_url: string | null };

/** The Monday (YYYY-MM-DD) of the week a cycle date falls in. Weeks run Monday to Sunday. */
export function weekStartFor(cycleDate: string): string {
  const date = new Date(`${cycleDate}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

/** League table: total points and the current week's, ranked; equal totals share a rank. */
export function buildStandings(teams: TeamRow[], rows: CyclePointsRow[], currentCycleDate: string, teamValues: Map<string, number> = new Map()): StandingRow[] {
  const weekStart = weekStartFor(currentCycleDate);
  const entries = teams.map((team) => {
    const mine = rows.filter((r) => r.user_id === team.user_id);
    return {
      ...team,
      teamValue: teamValues.get(team.user_id) ?? 0,
      avatar_url: team.avatar_url ?? null,
      total: mine.reduce((sum, r) => sum + r.points, 0),
      week: mine.filter((r) => weekStartFor(r.cycle_date) === weekStart).reduce((sum, r) => sum + r.points, 0),
    };
  });
  entries.sort((a, b) => b.total - a.total || a.team_name.localeCompare(b.team_name, "es"));

  return entries.map((entry, index) => {
    const firstWithSameTotal = entries.findIndex((e) => e.total === entry.total);
    return { ...entry, rank: firstWithSameTotal + 1 };
  });
}
