"use client";

import { useEffect, useState, useTransition } from "react";
import { saveNotificationPrefs, type ActionState } from "@/app/actions";
import { disablePush, enablePush, readPushState, type PushState } from "@/lib/push-client";
import type { Prefs } from "@/services/notifications";

type Notice = { kind: "ok" | "error"; text: string } | null;

export function NotificationSettings({ initialPrefs }: { initialPrefs: Prefs }) {
  const [device, setDevice] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => { readPushState().then(setDevice); }, []);

  async function turnOn() {
    setBusy(true); setNotice(null);
    const result = await enablePush();
    setDevice(await readPushState());
    setNotice(result.ok ? { kind: "ok", text: "Notificaciones activadas en este dispositivo." } : { kind: "error", text: result.message });
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true); setNotice(null);
    const result = await disablePush();
    setDevice(await readPushState());
    setNotice(result.ok ? { kind: "ok", text: "Notificaciones desactivadas en este dispositivo." } : { kind: "error", text: "No se pudo desactivar. Inténtalo de nuevo." });
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const body = (await response.json()) as { devices?: number; delivered?: number; error?: string };
      if (!response.ok) setNotice({ kind: "error", text: body.error ?? "No se pudo enviar la prueba." });
      else if (!body.delivered) setNotice({ kind: "error", text: "La prueba no llegó a ningún dispositivo. Desactiva y vuelve a activar las notificaciones." });
      else setNotice({ kind: "ok", text: `Prueba enviada a ${body.delivered} ${body.delivered === 1 ? "dispositivo" : "dispositivos"}.` });
    } catch {
      setNotice({ kind: "error", text: "No se pudo enviar la prueba." });
    }
    setBusy(false);
  }

  function change(key: keyof Prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setNotice(null);
    startSaving(async () => {
      const result: ActionState = await saveNotificationPrefs(next);
      if (result.error) { setPrefs(prefs); setNotice({ kind: "error", text: result.error }); }
      else setNotice({ kind: "ok", text: "Preferencias guardadas." });
    });
  }

  return (
    <div className="stack">
      <section className="settings-card" aria-labelledby="device-title">
        <h2 id="device-title">Este dispositivo</h2>
        {device === null ? <p className="hint">Comprobando…</p> : <DeviceStatus device={device} busy={busy} onOn={turnOn} onOff={turnOff} onTest={sendTest} />}
      </section>

      <section className="settings-card" aria-labelledby="prefs-title">
        <h2 id="prefs-title">Qué quieres recibir</h2>
        <p className="hint">Se aplica a todos tus dispositivos.</p>
        <label className="switch-row">
          <input type="checkbox" checked={prefs.bids} disabled={saving} onChange={(e) => change("bids", e.target.checked)} />
          <span><strong>Resultado de tus pujas</strong><small>Cuando fichas a un jugador o pierdes la puja.</small></span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={prefs.market} disabled={saving} onChange={(e) => change("market", e.target.checked)} />
          <span><strong>Mercado abierto</strong><small>Cada día, cuando hay jugadores nuevos en subasta.</small></span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={prefs.jornada} disabled={saving} onChange={(e) => change("jornada", e.target.checked)} />
          <span><strong>Jornada cerrada</strong><small>Cuando termina la semana: tus puntos y tu posición.</small></span>
        </label>
      </section>

      {notice && <p role={notice.kind === "error" ? "alert" : "status"} className={`msg ${notice.kind === "error" ? "msg-error" : "msg-ok"}`}>{notice.text}</p>}
    </div>
  );
}

function DeviceStatus({ device, busy, onOn, onOff, onTest }: { device: PushState; busy: boolean; onOn: () => void; onOff: () => void; onTest: () => void }) {
  if (device.ios && !device.standalone) {
    return <p>En iPhone y iPad las notificaciones solo funcionan con la web instalada: pulsa Compartir, elige «Añadir a pantalla de inicio» y ábrela desde ahí.</p>;
  }
  if (!device.supported) return <p>Este navegador no admite notificaciones.</p>;
  if (device.permission === "denied") {
    return <p>Las notificaciones están bloqueadas en el navegador. Actívalas en los ajustes del sitio y vuelve aquí.</p>;
  }
  if (device.subscribed) {
    return (
      <>
        <p><span className="status-dot on" aria-hidden="true" /> Activadas en este dispositivo.</p>
        <div className="actions">
          <button type="button" className="secondary" onClick={onTest} disabled={busy}>Enviarme una prueba</button>
          <button type="button" className="secondary" onClick={onOff} disabled={busy}>Desactivar</button>
        </div>
      </>
    );
  }
  return (
    <>
      <p><span className="status-dot" aria-hidden="true" /> Desactivadas en este dispositivo.</p>
      <div className="actions"><button type="button" onClick={onOn} disabled={busy}>{busy ? "Activando…" : "Activar notificaciones"}</button></div>
    </>
  );
}
