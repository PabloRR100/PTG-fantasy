"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { BUILD_ID } from "@/lib/build-id";
import { needsUpdate, UPDATE_CHECK_MS } from "@/lib/update-check";

/**
 * For the installed app: when a newer build is deployed, offers to reload into it. An installed app can stay open for
 * days, so it asks the server which build is live (on a timer and whenever it returns to the foreground) instead of
 * waiting for a browser navigation. Same idea as Betcomm's banner, but driven by the build id, not the service worker's bytes.
 */
export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!installed) return;
    let stopped = false;
    async function check() {
      try {
        const answer = await fetch("/api/version", { cache: "no-store" });
        const body = (await answer.json()) as { id?: unknown };
        if (!stopped && needsUpdate(BUILD_ID, body.id)) setOutdated(true);
      } catch {
        // Offline or a hiccup: ask again next time.
      }
    }
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const timer = window.setInterval(check, UPDATE_CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (!outdated) return null;
  return (
    <section className="push-banner update-banner" role="status" aria-label="Actualización disponible">
      <div className="push-banner-text">
        <strong><Icon name="install" size={16} /> Nueva versión disponible</strong>
        <span>Actualiza para tener las últimas mejoras.</span>
      </div>
      <button type="button" onClick={() => window.location.reload()}>Actualizar</button>
    </section>
  );
}
