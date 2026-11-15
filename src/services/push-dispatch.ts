import { PushError } from "@/lib/webpush";
import { parseSubscription, planDispatch, type OutboxRow, type Prefs, type PushSubscriptionData, type StoredSub } from "@/services/notifications";

/** Delivers one encrypted payload to one device. Throws PushError when the push gateway refuses it. */
export type Sender = (subscription: PushSubscriptionData, payloadJson: string) => Promise<void>;

/** What the dispatcher needs from storage. The real one is push-store.ts; tests use an in-memory one. */
export type DispatchStore = {
  claim(limit: number): Promise<OutboxRow[]>;
  subscriptions(userIds: string[]): Promise<StoredSub[]>;
  prefs(userIds: string[]): Promise<Map<string, Prefs>>;
  finish(ids: number[], state: "sent" | "skipped" | "failed"): Promise<void>;
  /** True only if a row was actually removed. */
  deleteSubscription(userId: string, endpointHash: string): Promise<boolean>;
};

export type DispatchReport = {
  claimed: number;
  /** Notifications that reached at least one device. */
  notified: number;
  /** Individual device deliveries. */
  deliveries: number;
  skipped: number;
  failed: number;
  /** Dead devices (404/410) whose subscription was removed. */
  expired: number;
  /** Dead devices we could not remove: reported, never counted as cleaned. */
  failedToClean: number;
};

const ATTEMPTS = 2;

/**
 * Claims pending notifications and delivers them. A 404 or 410 from the push gateway means the device is gone,
 * and its subscription is deleted. Every other refusal (401/403 bad VAPID, 400, 413, 5xx) is our problem or
 * the gateway's and would hit every device at once, so it never deletes anything.
 */
export async function dispatchPending(store: DispatchStore, send: Sender, limit = 200): Promise<DispatchReport> {
  const report: DispatchReport = { claimed: 0, notified: 0, deliveries: 0, skipped: 0, failed: 0, expired: 0, failedToClean: 0 };
  const rows = await store.claim(limit);
  report.claimed = rows.length;
  if (rows.length === 0) return report;

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [subs, prefs] = await Promise.all([store.subscriptions(userIds), store.prefs(userIds)]);
  const subsByUser = new Map<string, StoredSub[]>();
  for (const sub of subs) subsByUser.set(sub.user_id, [...(subsByUser.get(sub.user_id) ?? []), sub]);

  const { send: planned, skipped } = planDispatch(rows, subsByUser, prefs);
  const outcome = new Map<"sent" | "skipped" | "failed", number[]>([["sent", []], ["skipped", []], ["failed", []]]);
  for (const s of skipped) outcome.get("skipped")!.push(s.row.id);
  report.skipped = skipped.length;

  // Devices the gateway reported gone during this run: not tried again for the next notification.
  const gone = new Set<string>();

  for (const { row, payload, subs: devices } of planned) {
    let delivered = 0;
    let refused = 0;
    try {
      const json = JSON.stringify(payload);
      for (const device of devices) {
        const subscription = parseSubscription(device.subscription);
        const identity = `${device.user_id}:${device.endpoint_hash}`;
        if (!subscription || gone.has(identity)) continue;
        const result = await deliver(send, subscription, json);
        if (result === "ok") delivered++;
        else if (result === "failed") refused++;
        else if (await store.deleteSubscription(device.user_id, device.endpoint_hash)) {
          gone.add(identity);
          report.expired++;
        } else {
          console.error(`[push] ${device.user_id}: device is gone but its subscription was NOT deleted`);
          report.failedToClean++;
        }
      }
    } catch (error) {
      console.error(`[push] notification ${row.id} failed`, error);
      refused++;
    }
    report.deliveries += delivered;
    if (delivered > 0) { report.notified++; outcome.get("sent")!.push(row.id); }
    else if (refused > 0) { report.failed++; outcome.get("failed")!.push(row.id); }
    else { report.skipped++; outcome.get("skipped")!.push(row.id); }
  }

  for (const [state, ids] of outcome) if (ids.length > 0) await store.finish(ids, state);
  return report;
}

/** One device, with a retry. "gone" = the gateway says the subscription no longer exists (404/410). */
export async function deliver(send: Sender, subscription: PushSubscriptionData, json: string): Promise<"ok" | "gone" | "failed"> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await send(subscription, json);
      return "ok";
    } catch (error) {
      const status = error instanceof PushError ? error.status : 0;
      if (status === 404 || status === 410) return "gone";
    }
  }
  return "failed";
}
