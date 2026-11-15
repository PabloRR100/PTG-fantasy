import { describe, expect, test } from "vitest";
import { needsUpdate } from "@/lib/update-check";

describe("needsUpdate", () => {
  test("a different deployed build means update", () => expect(needsUpdate("dpl_a", "dpl_b")).toBe(true));
  test("the same build does not", () => expect(needsUpdate("dpl_a", "dpl_a")).toBe(false));
  test("a local dev build never nags", () => expect(needsUpdate("dev", "dpl_b")).toBe(false));
  test("an unreadable answer is not a reason to nag", () => {
    expect(needsUpdate("dpl_a", undefined)).toBe(false);
    expect(needsUpdate("dpl_a", "")).toBe(false);
    expect(needsUpdate("dpl_a", 3)).toBe(false);
  });
});
