import { describe, expect, test } from "vitest";
import { scoreMatch } from "@/services/scoring";

const sets = (...pairs: [number, number][]) => pairs.map(([mine, theirs]) => ({ mine, theirs }));

describe("scoreMatch", () => {
  test("a 2-0 win scores played + win + 2 sets = 8", () => {
    const r = scoreMatch({ sets: sets([6, 3], [6, 4]), walkover: false });
    expect(r).toEqual({ played: true, won: true, setsWon: 2, setsLost: 0, points: 8 });
  });

  test("a 2-1 win scores 7", () => {
    expect(scoreMatch({ sets: sets([6, 3], [3, 6], [6, 3]), walkover: false }).points).toBe(7);
  });

  test("a 1-2 loss scores 1", () => {
    const r = scoreMatch({ sets: sets([3, 6], [6, 3], [4, 6]), walkover: false });
    expect(r).toMatchObject({ won: false, setsWon: 1, setsLost: 2, points: 1 });
  });

  test("a 0-2 loss scores 0", () => {
    expect(scoreMatch({ sets: sets([3, 6], [4, 6]), walkover: false }).points).toBe(0);
  });

  test("a walkover is not played and scores 0", () => {
    const r = scoreMatch({ sets: [], walkover: true });
    expect(r).toEqual({ played: false, won: false, setsWon: 0, setsLost: 0, points: 0 });
  });
});
