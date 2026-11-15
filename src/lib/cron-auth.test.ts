import { describe, expect, test } from "vitest";
import { isAuthorizedCron } from "@/lib/cron-auth";

const req = (authorization?: string) => new Request("https://x.test/api/cron/push", { headers: authorization ? { authorization } : {} });

describe("isAuthorizedCron", () => {
  test("accepts exactly the bearer secret", () => expect(isAuthorizedCron(req("Bearer s3cret"), "s3cret")).toBe(true));
  test("rejects a missing header, a wrong secret and other schemes", () => {
    expect(isAuthorizedCron(req(), "s3cret")).toBe(false);
    expect(isAuthorizedCron(req("Bearer nope"), "s3cret")).toBe(false);
    expect(isAuthorizedCron(req("s3cret"), "s3cret")).toBe(false);
    expect(isAuthorizedCron(req("Basic s3cret"), "s3cret")).toBe(false);
  });
  test("a server with no secret configured accepts nobody (never fails open)", () => {
    expect(isAuthorizedCron(req("Bearer "), undefined)).toBe(false);
    expect(isAuthorizedCron(req("Bearer undefined"), undefined)).toBe(false);
    expect(isAuthorizedCron(req("Bearer "), "")).toBe(false);
  });
});
