const TIME_ZONE = "Europe/Madrid";
const CYCLE_START_HOUR = 6;

const madridClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The cycle a timestamp belongs to, as the YYYY-MM-DD Madrid date of the 06:00 boundary
 * at or before it. Shifting the Madrid wall clock back 6 hours turns "before 06:00"
 * into "the previous day", and DST needs no special case because we shift wall-clock fields.
 */
export function cycleDateFor(instant: Date): string {
  const parts = Object.fromEntries(
    madridClock.formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  );
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour - CYCLE_START_HOUR, parts.minute),
  );
  return shifted.toISOString().slice(0, 10);
}
