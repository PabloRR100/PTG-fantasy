import { extractEndpoint } from "@/lib/push-endpoint";
import { formatMoney } from "@/lib/format";

export type NotificationKind = "bid_won" | "bid_lost" | "market_open" | "jornada_closed" | "clause_taken";

/** A row of `notification_outbox`: something that happened and who should hear about it. */
export type OutboxRow = { id: number; user_id: string; kind: NotificationKind; data: Record<string, unknown> };

export type Prefs = { bids: boolean; market: boolean; jornada: boolean };
export const DEFAULT_PREFS: Prefs = { bids: true, market: true, jornada: true };

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
    case "clause_taken": {
      const buyer = text(row.data.buyer, "Un equipo");
      const amount = row.data.amount;
      const price = typeof amount === "number" && Number.isFinite(amount) ? ` por ${formatMoney(amount)}` : "";
      return { title: "Te han pagado una cláusula", body: `${buyer} se ha llevado a ${player}${price}. El dinero ya está en tu presupuesto.`, url: "/equipo", tag: `padel-clause-${player}` };
    }
    case "jornada_closed": {
      const week = text(row.data.week_start, "");
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const [points, rank, teams, overall, delta] = [num(row.data.points), num(row.data.rank), num(row.data.teams), num(row.data.overall_rank), num(row.data.delta)];
      const winner = text(row.data.winner, "");
      const moved = delta === null || delta === 0 ? "" : delta > 0 ? ` (subes ${delta})` : ` (bajas ${-delta})`;
      const mine = points === null || rank === null
        ? "Ya están los resultados de la jornada."
        : points === 0 ? "Esta jornada no sumaste puntos."
        : `Has sumado ${points} pts: ${rank}º${teams ? ` de ${teams}` : ""}.`;
      const table = overall === null ? "" : ` Ahora eres ${overall}º en la clasificación${moved}.`;
      const top = winner && rank !== 1 ? ` Ganó ${winner}.` : "";
      return { title: "Jornada cerrada", body: `${mine}${table}${top}`, url: week ? `/jornada?semana=${week}` : "/jornada", tag: `padel-jornada-${week || "last"}` };
    }
  }
}

/** Bid results follow the bids switch, a new market the market switch and a closed jornada the jornada switch. */
export function prefAllows(kind: NotificationKind, prefs: Prefs): boolean {
  if (kind === "market_open") return prefs.market;
  if (kind === "jornada_closed") return prefs.jornada;
  return prefs.bids;
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
