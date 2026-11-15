import type { PushSubscriptionData } from "@/services/notifications";
import { sendWebPush } from "@/lib/webpush";

/** The sender for this deployment, or the name of the variable that is missing. */
export function createSender(): { send: (subscription: PushSubscriptionData, payloadJson: string) => Promise<void> } | { missing: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey) return { missing: "NEXT_PUBLIC_VAPID_PUBLIC_KEY" };
  if (!privateKey) return { missing: "VAPID_PRIVATE_KEY" };
  // The push gateways want a way to contact the sender: a mailto: or an https URL.
  const subject = process.env.VAPID_SUBJECT ?? "https://padel-fantasy.betcomm.app";
  return { send: (subscription, payloadJson) => sendWebPush(subscription, payloadJson, publicKey, privateKey, subject) };
}
