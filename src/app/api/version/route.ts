import { BUILD_ID } from "@/lib/build-id";

// Never cached: the point is to learn what is deployed right now.
export const dynamic = "force-dynamic";

/** The build this server is running, so an open app can tell it is out of date. */
export function GET() {
  return Response.json({ id: BUILD_ID }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
