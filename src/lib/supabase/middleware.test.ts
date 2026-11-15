import { describe, expect, test } from "vitest";
import { isPublicRoute } from "@/lib/supabase/middleware";

describe("isPublicRoute", () => {
  test.each(["/login", "/auth/callback", "/api/cron/push", "/api/push/subscription", "/sw.js", "/manifest.webmanifest"])(
    "%s needs no session (the browser fetches it before anyone is signed in, or it authenticates itself)",
    (path) => expect(isPublicRoute(path)).toBe(true),
  );
  test.each(["/", "/equipo", "/mercado", "/jugadores", "/normas", "/ajustes", "/clasificacion", "/admin", "/onboarding"])(
    "%s still needs a session",
    (path) => expect(isPublicRoute(path)).toBe(false),
  );
});
