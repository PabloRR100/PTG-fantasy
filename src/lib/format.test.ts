import { describe, expect, test } from "vitest";
import { formatInt, formatMoney } from "@/lib/format";

describe("formatMoney", () => {
  test("groups thousands with dots and adds the euro sign", () => {
    expect(formatMoney(5_000_000)).toBe("5.000.000 €");
    expect(formatMoney(700_000)).toBe("700.000 €");
    expect(formatMoney(9_500)).toBe("9.500 €");
  });
});

describe("formatInt", () => {
  test("always groups thousands with dots, even four digits", () => {
    expect(formatInt(1280)).toBe("1.280");
    expect(formatInt(12)).toBe("12");
    expect(formatInt(1_234_567)).toBe("1.234.567");
  });
});
