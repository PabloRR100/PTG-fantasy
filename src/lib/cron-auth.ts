import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls a route with `Authorization: Bearer <CRON_SECRET>`. A server with no secret configured
 * accepts nobody: a missing variable must never turn a private route public.
 */
export function isAuthorizedCron(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
