"use client";

import { useEffect } from "react";

/** Registers the push service worker and refreshes this device's stored subscription if it has one. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        await fetch("/api/push/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
      })
      .catch(() => {
        // Best effort: push is an extra, never a reason to break the page.
      });
  }, []);
  return null;
}
