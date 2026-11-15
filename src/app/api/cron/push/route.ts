import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createSender } from "@/lib/push-sender";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchPending } from "@/services/push-dispatch";
import { createPushStore } from "@/services/push-store";

export const dynamic = "force-dynamic";

/** Vercel Cron, every 5 minutes: sends the notifications close_cycle queued. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sender = createSender();
  if ("missing" in sender) {
    return NextResponse.json({ error: `${sender.missing} is not set` }, { status: 500 });
  }
  const report = await dispatchPending(createPushStore(createServiceClient()), sender.send);
  return NextResponse.json(report);
}
