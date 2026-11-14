import { describe, expect, test } from "vitest";
import { cycleDateFor } from "@/services/cycles";

const at = (iso: string) => cycleDateFor(new Date(iso));

describe("cycleDateFor (06:00 Europe/Madrid boundary)", () => {
  test("05:59 Madrid in winter still belongs to the previous cycle", () => {
    expect(at("2026-11-14T04:59:00Z")).toBe("2026-11-13");
  });
  test("06:00 Madrid in winter starts the new cycle", () => {
    expect(at("2026-11-14T05:00:00Z")).toBe("2026-11-14");
  });
  test("summer boundary is one hour earlier in UTC", () => {
    expect(at("2026-07-01T03:59:00Z")).toBe("2026-06-30");
    expect(at("2026-07-01T04:00:00Z")).toBe("2026-07-01");
  });
  test("the day clocks go back (2026-10-25) keeps the 06:00 Madrid boundary", () => {
    expect(at("2026-10-25T04:59:00Z")).toBe("2026-10-24");
    expect(at("2026-10-25T05:00:00Z")).toBe("2026-10-25");
  });
  test("the day clocks go forward (2027-03-28) keeps the 06:00 Madrid boundary", () => {
    expect(at("2027-03-28T03:59:00Z")).toBe("2027-03-27");
    expect(at("2027-03-28T04:00:00Z")).toBe("2027-03-28");
  });
});
