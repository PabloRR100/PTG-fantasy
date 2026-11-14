import { describe, expect, test } from "vitest";
import { initialValue, nextValue } from "@/services/valuation";

describe("initialValue", () => {
  test("Blanco, ratio 0.8, 100 matches is 2,600,000", () => {
    expect(initialValue({ color: "Blanco", ratio: 0.8, matchesPlayed: 100 })).toBe(2_600_000);
  });
  test("a player with no matches is discounted by half", () => {
    expect(initialValue({ color: "Blanco", ratio: 0.5, matchesPlayed: 0 })).toBe(1_000_000);
  });
  test("lower colors cost less for the same record", () => {
    const rosa = initialValue({ color: "Rosa", ratio: 0.8, matchesPlayed: 100 });
    expect(rosa).toBe(910_000);
  });
});

describe("nextValue", () => {
  test("a hot streak rises at most 10%", () => {
    expect(nextValue(1_000_000, 30, 10)).toBe(1_100_000);
  });
  test("no points falls at most 10%", () => {
    expect(nextValue(1_000_000, 0, 10)).toBe(900_000);
  });
  test("recent equal to baseline leaves the value unchanged", () => {
    expect(nextValue(1_000_000, 10, 10)).toBe(1_000_000);
  });
  test("a zero baseline does not divide by zero", () => {
    expect(nextValue(1_000_000, 5, 0)).toBe(1_100_000);
  });
});
