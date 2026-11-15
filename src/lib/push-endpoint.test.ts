import { describe, it, expect } from "vitest";
import { hashEndpoint, extractEndpoint, PUSH_SUB_CONFLICT_TARGET } from "@/lib/push-endpoint";

// `push_subscriptions` identity is UNIQUE (user_id, endpoint_hash). These tests
// pin the two things incident 022 broke: the hash must be produced at all (it was
// omitted from one component, and the column is NOT NULL), and it must stay
// byte-identical to the three previous inline copies or every existing row stops
// matching.

describe("hashEndpoint", () => {
  it("produces lowercase hex SHA-256 of exactly 64 chars", async () => {
    const h = await hashEndpoint("https://fcm.googleapis.com/fcm/send/abc123");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known SHA-256 of a fixed string", async () => {
    // Pinned against an independent implementation. If this changes, every stored
    // endpoint_hash is invalidated and needs a rehash migration — that is the
    // whole point of asserting a literal here rather than a shape.
    // echo -n "abc" | shasum -a 256
    const h = await hashEndpoint("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is deterministic", async () => {
    const a = await hashEndpoint("https://push.example.com/x");
    const b = await hashEndpoint("https://push.example.com/x");
    expect(a).toBe(b);
  });

  it("distinguishes endpoints that differ by one character", async () => {
    // Two devices of the same user must land on two rows, not collide into one.
    const a = await hashEndpoint("https://fcm.googleapis.com/fcm/send/tokenA");
    const b = await hashEndpoint("https://fcm.googleapis.com/fcm/send/tokenB");
    expect(a).not.toBe(b);
  });

  it("handles a realistic FCM endpoint with a colon in the token", async () => {
    const h = await hashEndpoint(
      "https://fcm.googleapis.com/fcm/send/dY6_6Nj3Uf8:APA91bGT8DG-VDjA_long_token_here",
    );
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles the empty string without throwing", async () => {
    // Not a valid endpoint, but must not crash a batch — callers skip on "".
    await expect(hashEndpoint("")).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("extractEndpoint", () => {
  it("reads the endpoint from a parsed jsonb object", () => {
    expect(extractEndpoint({ endpoint: "https://a.example/1", keys: {} })).toBe("https://a.example/1");
  });

  it("reads the endpoint from a JSON string", () => {
    // Rows written by different code paths arrive in both shapes.
    expect(extractEndpoint('{"endpoint":"https://a.example/2"}')).toBe("https://a.example/2");
  });

  it("returns empty string for malformed JSON instead of throwing", () => {
    // A zombi row must be skippable, not fatal to the whole send batch.
    expect(extractEndpoint("{not json")).toBe("");
  });

  it("returns empty string when endpoint is missing, null or not a string", () => {
    expect(extractEndpoint({})).toBe("");
    expect(extractEndpoint({ endpoint: null })).toBe("");
    expect(extractEndpoint({ endpoint: 42 })).toBe("");
    expect(extractEndpoint(null)).toBe("");
    expect(extractEndpoint(undefined)).toBe("");
  });
});

describe("PUSH_SUB_CONFLICT_TARGET", () => {
  it("is the composite key, not user_id alone", () => {
    // The bug: `onConflict: 'user_id'` has no matching unique index. The only
    // unique constraint is push_subscriptions_user_endpoint (user_id, endpoint_hash),
    // so upserting on user_id alone fails — and one user legitimately has several
    // devices, so collapsing to one row per user would be wrong even if it worked.
    expect(PUSH_SUB_CONFLICT_TARGET).toBe("user_id,endpoint_hash");
    expect(PUSH_SUB_CONFLICT_TARGET).not.toBe("user_id");
  });
});
