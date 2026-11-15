import { deliver, type Sender } from "@/services/push-dispatch";
import { parseSubscription, type StoredSub } from "@/services/notifications";

export type TestResult = { devices: number; delivered: number; removed: number; failed: number };

const TEST_MESSAGE = JSON.stringify({
  title: "Notificaciones activadas",
  body: "Así te avisaremos de tus pujas y del mercado.",
  url: "/ajustes",
  tag: "padel-test",
});

/** Sends the test notification to a manager's own devices; a device the gateway reports gone is removed. */
export async function dispatchTest(
  devices: StoredSub[],
  send: Sender,
  remove: (endpointHash: string) => Promise<boolean>,
): Promise<TestResult> {
  const result: TestResult = { devices: devices.length, delivered: 0, removed: 0, failed: 0 };
  for (const device of devices) {
    const subscription = parseSubscription(device.subscription);
    if (!subscription) { result.failed++; continue; }
    const outcome = await deliver(send, subscription, TEST_MESSAGE);
    if (outcome === "ok") result.delivered++;
    else if (outcome === "gone" && (await remove(device.endpoint_hash))) result.removed++;
    else result.failed++;
  }
  return result;
}
