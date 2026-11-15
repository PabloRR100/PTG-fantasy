// Browser side of web push: who should be reminded, and how a device subscribes and unsubscribes.
// The server stores subscriptions (src/app/api/push/subscription) and sends (src/app/api/cron/push).

export const SNOOZE_KEY = "padel-push-snoozed-until";
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export type ReminderInput = {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  /** Epoch ms until which the reminder was dismissed, or null. */
  snoozedUntil: number | null;
  now: number;
  ios: boolean;
  standalone: boolean;
};

/**
 * Whether to nudge this device to switch notifications on. Only when it can push, nobody has decided yet
 * (granted and denied both end the nagging), it is not subscribed, and the last dismissal is over. iPhone
 * Safari can only push from an installed app, so the nudge waits for that.
 */
export function shouldShowReminder(input: ReminderInput): boolean {
  if (!input.supported || input.permission !== "default" || input.subscribed) return false;
  if (input.ios && !input.standalone) return false;
  return input.snoozedUntil === null || input.now >= input.snoozedUntil;
}

export type PushState = {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  ios: boolean;
  standalone: boolean;
};

export async function readPushState(): Promise<PushState> {
  const supported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
  if (!supported) return { supported, permission: "default", subscribed: false, ios, standalone };
  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.ready;
    subscribed = (await registration.pushManager.getSubscription()) !== null;
  } catch {
    // Unreadable means "not subscribed": the worst case is showing the switch off.
  }
  return { supported, permission: Notification.permission, subscribed, ios, standalone };
}

export function readSnooze(): number | null {
  const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(SNOOZE_KEY);
  const until = raw === null ? NaN : parseInt(raw, 10);
  return Number.isNaN(until) ? null : until;
}

export function snoozeReminder(now = Date.now()) {
  localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_MS));
}

export type EnableResult = { ok: true } | { ok: false; reason: "unsupported" | "denied" | "error"; message: string };

/** Asks permission, subscribes this device and stores the subscription. */
export async function enablePush(): Promise<EnableResult> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: "error", message: "Las notificaciones no están configuradas en este servidor." };
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported", message: "Este navegador no admite notificaciones." };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "denied", message: "Has bloqueado las notificaciones en el navegador. Actívalas en sus ajustes y vuelve aquí." };
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
    // fetch resolves on a 4xx/5xx instead of throwing: check it, or a failed save looks like success.
    const response = await fetch("/api/push/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!response.ok) {
      await subscription.unsubscribe().catch(() => undefined);
      return { ok: false, reason: "error", message: "No se pudo guardar la suscripción. Inténtalo de nuevo." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "error", message: error instanceof Error ? error.message : "No se pudo activar." };
  }
}

/** Unsubscribes this device and removes its stored subscription. */
export async function disablePush(): Promise<{ ok: boolean }> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const response = await fetch("/api/push/subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (!response.ok) return { ok: false };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
