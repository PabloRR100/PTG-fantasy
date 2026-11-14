import { madridParts } from "@/lib/madrid-time";

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
