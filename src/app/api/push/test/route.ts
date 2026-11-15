import { NextResponse } from "next/server";
import { createSender } from "@/lib/push-sender";
import { createClient } from "@/lib/supabase/server";
import { parseSubscription, type StoredSub } from "@/services/notifications";
import { dispatchTest } from "@/services/push-test";

export const dynamic = "force-dynamic";

/** "Send me a test": a notification to the signed-in manager's own devices, so they can see it work. */
export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sender = createSender();
  if ("missing" in sender) return NextResponse.json({ error: "Las notificaciones no están configuradas en el servidor." }, { status: 500 });

  const { data: rows, error } = await supabase.from("push_subscriptions").select("user_id, subscription, endpoint_hash").eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const devices = ((rows ?? []) as StoredSub[]).filter((row) => parseSubscription(row.subscription) !== null);
  const result = await dispatchTest(devices, sender.send, async (hash) => {
    const { count } = await supabase.from("push_subscriptions").delete({ count: "exact" }).eq("user_id", userId).eq("endpoint_hash", hash);
    return (count ?? 0) > 0;
  });
  return NextResponse.json(result);
}
