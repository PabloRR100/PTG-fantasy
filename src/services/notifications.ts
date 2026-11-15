import { extractEndpoint } from "@/lib/push-endpoint";
import { formatMoney } from "@/lib/format";

export type NotificationKind = "bid_won" | "bid_lost" | "market_open";

/** A row of `notification_outbox`: something that happened and who should hear about it. */
export type OutboxRow = { id: number; user_id: string; kind: NotificationKind; data: Record<string, unknown> };

export type Prefs = { bids: boolean; market: boolean };
export const DEFAULT_PREFS: Prefs = { bids: true, market: true };

/** A browser's push subscription as the browser serializes it (`PushSubscription.toJSON()`). */
export type PushSubscriptionData = { endpoint: string; keys: { p256dh: string; auth: string } };

/** A row of `push_subscriptions`. `subscription` is jsonb: it arrives as an object or as a JSON string. */
export type StoredSub = { user_id: string; endpoint_hash: string; subscription: unknown };

export type Payload = { title: string; body: string; url: string; tag: string };

const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() !== "" ? value : fallback);

/**
 * What the phone shows. All wording lives here, so changing a message never needs a migration: the outbox
 * stores facts (player, amount, count), never copy. Data comes from jsonb, so every field is checked.
 */
export function buildNotification(row: OutboxRow): Payload {
  const player = text(row.data.player, "ese jugador");
  switch (row.kind) {
    case "bid_won": {
      const amount = row.data.amount;
      const price = typeof amount === "number" && Number.isFinite(amount) ? ` por ${formatMoney(amount)}` : "";
      return { title: "¡Es tuyo!", body: `Has fichado a ${player}${price}.`, url: "/equipo", tag: `padel-bid-won-${player}` };
    }
    case "bid_lost":
      return { title: "Puja perdida", body: `No te has llevado a ${player}.`, url: "/mercado", tag: `padel-bid-lost-${player}` };
    case "market_open": {
      const count = row.data.count;
      const body =
        typeof count === "number" && count > 0
          ? `Hay ${count} ${count === 1 ? "jugador" : "jugadores"} en subasta.`
          : "Hay jugadores nuevos en subasta.";
      return { title: "Mercado abierto", body, url: "/mercado", tag: "padel-market-open" };
    }
  }
}

/** Bid results follow the bids switch; a new market follows the market switch. */
export function prefAllows(kind: NotificationKind, prefs: Prefs): boolean {
  return kind === "market_open" ? prefs.market : prefs.bids;
}

export function parseSubscription(subscription: unknown): PushSubscriptionData | null {
  try {
    const parsed = (typeof subscription === "string" ? JSON.parse(subscription) : subscription) as Partial<PushSubscriptionData> | null;
    return parsed && typeof parsed.endpoint === "string" && parsed.keys ? (parsed as PushSubscriptionData) : null;
  } catch {
    return null;
  }
}

export type PlannedSend = { row: OutboxRow; payload: Payload; subs: StoredSub[] };
export type Skipped = { row: OutboxRow; reason: "prefs" | "no_subscription" };

/**
 * Decides, without touching the network, what happens to each claimed row: sent to the owner's devices, or
 * skipped because they switched that kind off or have no device. A device is listed once per row even if the
 * table holds it twice.
 */
export function planDispatch(
  rows: OutboxRow[],
  subsByUser: Map<string, StoredSub[]>,
  prefsByUser: Map<string, Prefs>,
): { send: PlannedSend[]; skipped: Skipped[] } {
  const send: PlannedSend[] = [];
  const skipped: Skipped[] = [];

  for (const row of rows) {
    if (!prefAllows(row.kind, prefsByUser.get(row.user_id) ?? DEFAULT_PREFS)) {
      skipped.push({ row, reason: "prefs" });
      continue;
    }
    const seen = new Set<string>();
    const subs = (subsByUser.get(row.user_id) ?? []).filter((sub) => {
      const endpoint = extractEndpoint(sub.subscription);
      if (!endpoint || seen.has(endpoint)) return false;
      seen.add(endpoint);
      return true;
    });
    if (subs.length === 0) skipped.push({ row, reason: "no_subscription" });
    else send.push({ row, payload: buildNotification(row), subs });
  }
  return { send, skipped };
}
