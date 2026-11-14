export type ParsedPlayer = { ptgPlayerId: string; displayName: string; isViewer: boolean };
export type ParsedSet = { a: number; b: number };

/** One match as shown on its page. Sets are from pair A's point of view. */
export type ParsedMatch = {
  ptgMatchId: string;
  /** ISO instant; PTG shows Madrid wall-clock time without a year. */
  playedAt: string;
  club: string;
  finished: boolean;
  walkover: boolean;
  pairA: ParsedPlayer[];
  pairB: ParsedPlayer[];
  sets: ParsedSet[];
};

export type RankedPlayer = {
  ptgPlayerId: string;
  displayName: string;
  matchesPlayed: number;
  /** Win ratio between 0 and 1. */
  ratio: number;
};

export const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
