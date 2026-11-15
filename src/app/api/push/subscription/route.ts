import { NextResponse } from "next/server";
import { hashEndpoint } from "@/lib/push-endpoint";
import { createClient } from "@/lib/supabase/server";
import { parseSubscription } from "@/services/notifications";

export const dynamic = "force-dynamic";

async function signedInUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub ?? null };
}

/**
 * Stores (or refreshes) this device's subscription. The browser also calls it when it rotates its credentials
 * (`pushsubscriptionchange`), sending the endpoint it replaces so the old row goes away. The hash is derived here,
 * so a caller that cannot import our code (the service worker) cannot get it wrong.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await signedInUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { subscription?: unknown; previousEndpoint?: unknown } | null;
  const subscription = parseSubscription(body?.subscription);
  if (!subscription) return NextResponse.json({ error: "Missing or malformed subscription" }, { status: 400 });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: userId, subscription, endpoint_hash: await hashEndpoint(subscription.endpoint) }, { onConflict: "user_id,endpoint_hash" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (typeof body?.previousEndpoint === "string" && body.previousEndpoint !== subscription.endpoint) {
    await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint_hash", await hashEndpoint(body.previousEndpoint));
  }
  return NextResponse.json({ ok: true });
}

/** Removes this device's subscription. */
export async function DELETE(request: Request) {
  const { supabase, userId } = await signedInUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || body.endpoint === "") {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint_hash", await hashEndpoint(body.endpoint));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
