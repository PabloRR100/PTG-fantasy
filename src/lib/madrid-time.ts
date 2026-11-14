const TIME_ZONE = "Europe/Madrid";

const madridClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

/** What a Madrid wall clock shows at the given instant. */
export function madridParts(instant: Date): WallClock {
  const parts = Object.fromEntries(
    madridClock.formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** The instant at which a Madrid wall clock shows the given time (month is 1-12). */
export function madridToInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (instantMs: number) => {
    const w = madridParts(new Date(instantMs));
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - instantMs;
  };
  // The offset depends on the instant itself, so settle it in two passes (covers DST edges).
  const firstGuess = wallAsUtc - offsetAt(wallAsUtc);
  return new Date(wallAsUtc - offsetAt(firstGuess));
}
