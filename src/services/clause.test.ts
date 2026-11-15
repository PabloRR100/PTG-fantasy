import { describe, expect, test } from "vitest";
import { clauseFloor, clausePrice, lockCost, maxExtra } from "@/services/clause";

describe("clause maths", () => {
  test("floor is twice the value and the extra is added on top", () => {
    expect(clauseFloor(1_000_000)).toBe(2_000_000);
    expect(clausePrice(1_000_000, 300_000)).toBe(2_300_000);
  });
  test("the extra is capped at twice the value, rounded down to a step", () => {
    expect(maxExtra(1_000_000)).toBe(2_000_000);
    expect(maxExtra(455_000)).toBe(910_000);
    expect(maxExtra(457_000)).toBe(910_000);
  });
  test("raising locks half the increase and lowering gives the same half back", () => {
    expect(lockCost(0, 400_000)).toBe(200_000);
    expect(lockCost(400_000, 100_000)).toBe(-150_000);
    expect(lockCost(100_000, 100_000)).toBe(0);
  });
});

import { isProtected, protectedUntilLabel } from "@/services/clause";
describe("protection helpers", () => {
  test("isProtected compares with now and ignores null", () => {
    const now = new Date("2026-11-16T10:00:00Z");
    expect(isProtected("2026-11-17T10:00:00Z", now)).toBe(true);
    expect(isProtected("2026-11-16T09:59:00Z", now)).toBe(false);
    expect(isProtected(null, now)).toBe(false);
  });
  test("the label is in Madrid time", () => expect(protectedUntilLabel("2026-11-19T05:12:00Z")).toContain("06:12"));
});
