"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { isIos, readInstallSnooze, shouldShowInstall, snoozeInstall } from "@/lib/install-client";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * Offers to install the app when this is a browser tab: a button that opens the browser's own install dialog, or on
 * iPhone (which has none) the Share steps. Dismissing pauses it for a day; once installed it never appears.
 */
export function InstallBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    setSnoozedUntil(readInstallSnooze());
    setIos(isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
    const onPrompt = (event: Event) => {
      event.preventDefault(); // keep the browser's own mini-bar away: the banner is the offer
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!prompt) return setGuide(!guide);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setStandalone(true);
    setPrompt(null);
  }

  function dismiss() {
    snoozeInstall();
    setSnoozedUntil(readInstallSnooze());
  }

  if (!shouldShowInstall({ standalone, canPrompt: prompt !== null, ios, snoozedUntil, now: Date.now() })) return null;
  return (
    <section className="push-banner install-banner" aria-label="Instalar la app">
      <div className="push-banner-text">
        <strong><Icon name="install" size={16} /> Instala la app</strong>
        <span>Acceso directo desde tu pantalla de inicio y avisos en el móvil.</span>
        {guide && (
          <ol className="install-steps">
            <li>Toca <Icon name="share" size={14} /> <b>Compartir</b> en Safari.</li>
            <li>Elige <b>Añadir a pantalla de inicio</b>.</li>
            <li>Toca <b>Añadir</b>.</li>
          </ol>
        )}
      </div>
      <button type="button" onClick={install}>{prompt ? "Instalar" : "Cómo"}</button>
      <button type="button" className="secondary" onClick={dismiss} aria-label="Recordarme mañana">Ahora no</button>
    </section>
  );
}
