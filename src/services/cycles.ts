import { madridParts, madridToInstant } from "@/lib/madrid-time";

const CYCLE_START_HOUR = 6;

/**
 * The cycle a timestamp belongs to, as the YYYY-MM-DD Madrid date of the 06:00 boundary
 * at or before it. Shifting the Madrid wall clock back 6 hours turns "before 06:00"
 * into "the previous day", and DST needs no special case because we shift wall-clock fields.
 */
export function cycleDateFor(instant: Date): string {
  const w = madridParts(instant);
  const shifted = new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour - CYCLE_START_HOUR, w.minute));
  return shifted.toISOString().slice(0, 10);
}

/** The instants at which the cycle containing `instant` starts and ends (06:00 Madrid to 06:00 Madrid). */
export function cycleBoundsFor(instant: Date): { start: Date; end: Date } {
  const [year, month, day] = cycleDateFor(instant).split("-").map(Number);
  return {
    start: madridToInstant(year, month, day, CYCLE_START_HOUR, 0),
    // Date.UTC rolls the day over month ends, so the next day needs no calendar code.
    end: nextDayAt6(year, month, day),
  };
}

function nextDayAt6(year: number, month: number, day: number): Date {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return madridToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), CYCLE_START_HOUR, 0);
}
