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
