
//
// The canonical `endpoint_hash` for a Web Push subscription.
//
// WHY THIS FILE EXISTS: this function was copy-pasted as a local helper into
// three components (ServiceWorkerRegistrar, PushNotification, PushReminderBanner)
// and *omitted* from a fourth (PushNotificationIcon). Because it was missing
// there, that component's upsert left `endpoint_hash` unset — and the column is
// `NOT NULL` — so every subscribe from the header icon failed at the DB while the
// UI flipped to "subscribed" anyway. See Betcomm incident 022.
//
// `push_subscriptions` identity is `UNIQUE (user_id, endpoint_hash)`
// (`push_subscriptions_user_endpoint`, migration 0001). The hash — not the
// `subscription` jsonb — is the only stable key for a row:
//
//   * The endpoint is what the gateway actually addresses.
//   * `subscription` is `jsonb`, so comparing it against a `JSON.stringify(...)`
//     string is fragile (key order, whitespace, and the `expirationTime: null`
//     field all vary). `push-transport.ts` used to DELETE expired rows that way
//     and silently matched zero rows while reporting them as cleaned.
//
// Every read, write and delete of a push subscription row keys on this value.

/**
 * SHA-256 of the push endpoint URL, lowercase hex.
 *
 * Deliberately identical to the three previous inline copies so existing rows
 * keep matching — do NOT "improve" the algorithm without a migration that
 * rehashes every stored row, or every device silently becomes a new subscription
 * and the old one is never cleaned up.
 *
 * Uses Web Crypto (`crypto.subtle`), available in browsers and in Node 20+, so
 * the same helper works client-side and in route handlers.
 */
export async function hashEndpoint(endpoint: string): Promise<string> {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The conflict target for every `push_subscriptions` upsert. */
export const PUSH_SUB_CONFLICT_TARGET = "user_id,endpoint_hash";

/**
 * Reads the endpoint out of whatever shape a stored `subscription` column has.
 *
 * Rows arrive as a parsed object (jsonb) or as a JSON string, depending on which
 * writer created them and whether the client parsed it. Returns `""` for a
 * malformed row rather than throwing: an unusable row must be skippable, not
 * fatal to a whole send batch.
 */
export function extractEndpoint(subscription: unknown): string {
  try {
    const parsed = typeof subscription === "string" ? JSON.parse(subscription) : subscription;
    const endpoint = (parsed as { endpoint?: unknown } | null)?.endpoint;
    return typeof endpoint === "string" ? endpoint : "";
  } catch {
    return "";
  }
}
