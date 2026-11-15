"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { enablePush, readPushState, readSnooze, shouldShowReminder, snoozeReminder } from "@/lib/push-client";

/**
 * Nudges a manager to switch notifications on, but only when it can help: this browser can push, nobody has
 * decided yet and this device is not subscribed. Dismissing or refusing pauses it for a week.
 */
export function PushReminderBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readPushState().then((state) => {
      if (!cancelled) setVisible(shouldShowReminder({ ...state, snoozedUntil: readSnooze(), now: Date.now() }));
    });
    return () => { cancelled = true; };
  }, []);

  async function activate() {
    setBusy(true);
    setError(null);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) return setVisible(false);
    if (result.reason === "denied") { snoozeReminder(); return setVisible(false); }
    setError(result.message);
  }

  function dismiss() {
    snoozeReminder();
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <section className="push-banner" aria-label="Activar notificaciones">
      <div className="push-banner-text">
        <strong>Activa las notificaciones</strong>
        <span>{error ?? "Te avisamos cuando se resuelvan tus pujas y se abra el mercado."} <Link href="/ajustes">Ajustes</Link></span>
      </div>
      <button type="button" onClick={activate} disabled={busy}>{busy ? "Activando…" : "Activar"}</button>
      <button type="button" className="secondary" onClick={dismiss} aria-label="Recordarme en 7 días">Ahora no</button>
    </section>
  );
}
