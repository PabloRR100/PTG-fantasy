import { describe, expect, test } from "vitest";
import { rpcMessage, validateTeamName } from "@/lib/rpc-errors";

describe("rpcMessage", () => {
  test.each([
    ["bid is below the market value (minimum 1500000)", /mínimo.*1\.500\.000/i],
    ["bid is above your budget (900000)", /presupuesto.*900\.000/i],
    ["listing is not open", /cerrada/i],
    ["player already has a team", /ya ha fichado/i],
    ["lineup needs exactly 2 players per color (18 in total)", /2 .*nivel.*18/i],
    ["you need at least 2 players of each color", /al menos 2/i],
    ["user already has a team", /ya tienes/i],
    ["admin only", /administrador/i],
  ])("translates %s", (raw, expected) => expect(rpcMessage(raw)).toMatch(expected));

  test("an unknown message never leaks raw SQL text to the manager", () => {
    expect(rpcMessage('duplicate key value violates unique constraint "bids_pkey"')).toBe(
      "No se pudo completar la acción. Inténtalo de nuevo.",
    );
  });
});

describe("validateTeamName", () => {
  test("trims and accepts 2 to 30 characters", () => expect(validateTeamName("  Los Pepros ")).toEqual({ ok: true, name: "Los Pepros" }));
  test("rejects a 1-character name", () => expect(validateTeamName("A")).toMatchObject({ ok: false }));
  test("rejects 31 characters", () => expect(validateTeamName("x".repeat(31))).toMatchObject({ ok: false }));
  test("rejects missing input", () => expect(validateTeamName(null)).toMatchObject({ ok: false }));
});
