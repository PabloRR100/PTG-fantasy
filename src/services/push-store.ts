import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PREFS, type OutboxRow, type Prefs, type StoredSub } from "@/services/notifications";
import type { DispatchStore } from "@/services/push-dispatch";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/** The dispatcher's storage on Supabase. Needs a service-role client: the outbox has no RLS policies. */
export function createPushStore(db: SupabaseClient): DispatchStore {
  return {
    async claim(limit) {
      return unwrap<OutboxRow[]>(await db.rpc("claim_notifications", { p_limit: limit }), "claim notifications");
    },
    async subscriptions(userIds) {
      return unwrap<StoredSub[]>(
        await db.from("push_subscriptions").select("user_id, subscription, endpoint_hash").in("user_id", userIds),
        "load subscriptions",
      );
    },
    async prefs(userIds) {
      const rows = unwrap<{ user_id: string; bids: boolean; market: boolean; jornada: boolean }[]>(
        await db.from("notification_prefs").select("user_id, bids, market, jornada").in("user_id", userIds),
        "load preferences",
      );
      return new Map<string, Prefs>(rows.map((r) => [r.user_id, { ...DEFAULT_PREFS, bids: r.bids, market: r.market, jornada: r.jornada }]));
    },
    async finish(ids, state) {
      const { error } = await db.from("notification_outbox").update({ state, processed_at: new Date().toISOString() }).in("id", ids);
      if (error) throw new Error(`finish notifications: ${error.message}`);
    },
    async deleteSubscription(userId, endpointHash) {
      // Delete by the stored hash (the table's identity) and count what really went away: never report a cleanup that did not happen.
      const { error, count } = await db
        .from("push_subscriptions")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .eq("endpoint_hash", endpointHash);
      return !error && (count ?? 0) > 0;
    },
  };
}
