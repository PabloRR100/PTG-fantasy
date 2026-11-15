import { describe, expect, test } from "vitest";
import { dispatchTest } from "@/services/push-test";
import { PushError } from "@/lib/webpush";
import type { StoredSub } from "@/services/notifications";

const device = (endpoint: string): StoredSub => ({ user_id: "u1", endpoint_hash: `h-${endpoint}`, subscription: { endpoint, keys: { p256dh: "k", auth: "a" } } });

describe("dispatchTest", () => {
  test("sends the test message to every device and reports how many got it", async () => {
    const sent: string[] = [];
    const result = await dispatchTest([device("https://p/1"), device("https://p/2")], async (s, json) => { sent.push(`${s.endpoint} ${JSON.parse(json).title}`); }, async () => true);
    expect(sent).toEqual(["https://p/1 Notificaciones activadas", "https://p/2 Notificaciones activadas"]);
    expect(result).toEqual({ devices: 2, delivered: 2, removed: 0, failed: 0 });
  });
  test("a device that is gone is removed and does not count as delivered", async () => {
    const removed: string[] = [];
    const result = await dispatchTest([device("https://p/dead"), device("https://p/live")],
      async (s) => { if (s.endpoint.endsWith("dead")) throw new PushError(410, ""); },
      async (hash) => { removed.push(hash); return true; });
    expect(removed).toEqual(["h-https://p/dead"]);
    expect(result).toEqual({ devices: 2, delivered: 1, removed: 1, failed: 0 });
  });
  test("a refusal that is not 'gone' is a failure and removes nothing", async () => {
    const removed: string[] = [];
    const result = await dispatchTest([device("https://p/1")], async () => { throw new PushError(403, "bad vapid"); }, async (h) => { removed.push(h); return true; });
    expect(removed).toEqual([]);
    expect(result).toEqual({ devices: 1, delivered: 0, removed: 0, failed: 1 });
  });
  test("no devices is a clear zero", async () => {
    expect(await dispatchTest([], async () => {}, async () => true)).toEqual({ devices: 0, delivered: 0, removed: 0, failed: 0 });
  });
});
