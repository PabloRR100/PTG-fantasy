/** The floor of a release clause: twice the player's market value. Mirrors pay_release_clause (migrations 0014, 0015). */
export const CLAUSE_MULTIPLIER = 2;
/** The owner can add up to twice the value on top of the floor, in steps of this many euros (migration 0015). */
export const MAX_EXTRA_MULTIPLIER = 2;
export const CLAUSE_STEP = 10_000;
/** Share of an increase that is locked from the owner's budget; lowering gives the same share back. */
export const LOCK_SHARE = 0.5;

export const clauseFloor = (value: number) => value * CLAUSE_MULTIPLIER;

/** What a rival pays now: the floor plus whatever the owner added. */
export function clausePrice(value: number, extra = 0): number {
  return clauseFloor(value) + extra;
}

/** The most extra an owner can add to this player. */
export function maxExtra(value: number): number {
  return Math.floor((value * MAX_EXTRA_MULTIPLIER) / CLAUSE_STEP) * CLAUSE_STEP;
}

/** Budget needed (positive) or given back (negative) for moving the extra from `from` to `to`. */
export function lockCost(from: number, to: number): number {
  return Math.trunc(((to - from) * LOCK_SHARE));
}

/** A player who just joined a team (market signing or clause) cannot be taken by clause for this long (migration 0016). */
export const PROTECTION_DAYS = 3;

export function isProtected(until: string | null, now = new Date()): boolean {
  return until !== null && new Date(until).getTime() > now.getTime();
}

/** "lun 16 nov, 06:12" in Madrid time. */
export function protectedUntilLabel(until: string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(until)).replace(/\./g, "").replace(/ de /g, " ");
}
