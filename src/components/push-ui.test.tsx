// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PushState } from "@/lib/push-client";

const push = vi.hoisted(() => ({
  state: { supported: true, permission: "default", subscribed: false, ios: false, standalone: false } as PushState,
  snoozedUntil: null as number | null,
  snoozed: 0,
  enable: undefined as unknown as () => Promise<unknown>,
  disable: undefined as unknown as () => Promise<unknown>,
}));
vi.mock("@/lib/push-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/push-client")>()),
  readPushState: async () => ({ ...push.state }),
  readSnooze: () => push.snoozedUntil,
  snoozeReminder: () => { push.snoozed++; },
  enablePush: () => push.enable(),
  disablePush: () => push.disable(),
}));
const savePrefs = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions", () => ({ saveNotificationPrefs: savePrefs }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { NotificationSettings } from "@/components/NotificationSettings";
import { PushReminderBanner } from "@/components/PushReminderBanner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async (node: React.ReactNode) => { act(() => root.render(node)); await flush(); };
const button = (label: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); }); };

beforeEach(() => {
  push.state = { supported: true, permission: "default", subscribed: false, ios: false, standalone: false };
  push.snoozedUntil = null;
  push.snoozed = 0;
  push.enable = async () => ({ ok: true });
  push.disable = async () => ({ ok: true });
  savePrefs.mockReset();
  savePrefs.mockResolvedValue({ ok: "Preferencias guardadas." });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("PushReminderBanner", () => {
  test("asks a manager who has not decided yet, with a way to the settings", async () => {
    await render(<PushReminderBanner />);
    expect(host.textContent).toContain("Activa las notificaciones");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/ajustes");
  });

  test.each([
    ["already granted", { permission: "granted" as const }],
    ["blocked in the browser", { permission: "denied" as const }],
    ["already subscribed", { subscribed: true }],
    ["unsupported", { supported: false }],
    ["iPhone outside the installed app", { ios: true, standalone: false }],
  ])("stays out of the way when %s", async (_name, over) => {
    push.state = { ...push.state, ...over };
    await render(<PushReminderBanner />);
    expect(host.textContent).toBe("");
  });

  test("stays out of the way during a snooze", async () => {
    push.snoozedUntil = Date.now() + 60_000;
    await render(<PushReminderBanner />);
    expect(host.textContent).toBe("");
  });

  test("Activar subscribes and the banner goes away", async () => {
    const enable = vi.fn(async () => ({ ok: true }));
    push.enable = enable;
    await render(<PushReminderBanner />);
    await click(button("Activar")!);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("");
  });

  test("refusing the browser prompt pauses the reminder for a week instead of nagging", async () => {
    push.enable = async () => ({ ok: false, reason: "denied", message: "bloqueado" });
    await render(<PushReminderBanner />);
    await click(button("Activar")!);
    expect(push.snoozed).toBe(1);
    expect(host.textContent).toBe("");
  });

  test("a failure keeps the banner and says why", async () => {
    push.enable = async () => ({ ok: false, reason: "error", message: "No se pudo guardar la suscripción." });
    await render(<PushReminderBanner />);
    await click(button("Activar")!);
    expect(host.textContent).toContain("No se pudo guardar la suscripción.");
    expect(button("Activar")).toBeDefined();
    expect(push.snoozed).toBe(0);
  });

  test("Ahora no pauses it", async () => {
    await render(<PushReminderBanner />);
    await click(button("Ahora no")!);
    expect(push.snoozed).toBe(1);
    expect(host.textContent).toBe("");
  });
});

describe("NotificationSettings", () => {
  const prefs = { bids: true, market: true };

  test("a device that can push but has not subscribed offers to switch on", async () => {
    await render(<NotificationSettings initialPrefs={prefs} />);
    expect(host.textContent).toContain("Desactivadas en este dispositivo");
    expect(button("Activar notificaciones")).toBeDefined();
    expect(button("Desactivar")).toBeUndefined();
  });

  test("switching on subscribes and the screen follows what the browser now says", async () => {
    push.enable = async () => { push.state = { ...push.state, permission: "granted", subscribed: true }; return { ok: true }; };
    await render(<NotificationSettings initialPrefs={prefs} />);
    await click(button("Activar notificaciones")!);
    expect(host.textContent).toContain("Activadas en este dispositivo");
    expect(host.textContent).toContain("Notificaciones activadas en este dispositivo.");
    expect(button("Desactivar")).toBeDefined();
  });

  test("a failed activation shows the reason and changes nothing", async () => {
    push.enable = async () => ({ ok: false, reason: "error", message: "No se pudo guardar la suscripción." });
    await render(<NotificationSettings initialPrefs={prefs} />);
    await click(button("Activar notificaciones")!);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("No se pudo guardar la suscripción.");
    expect(host.textContent).toContain("Desactivadas en este dispositivo");
  });

  test("switching off", async () => {
    push.state = { ...push.state, permission: "granted", subscribed: true };
    push.disable = async () => { push.state = { ...push.state, subscribed: false }; return { ok: true }; };
    await render(<NotificationSettings initialPrefs={prefs} />);
    await click(button("Desactivar")!);
    expect(host.textContent).toContain("Desactivadas en este dispositivo");
  });

  test("blocked in the browser: explains how to fix it instead of offering a button that cannot work", async () => {
    push.state = { ...push.state, permission: "denied" };
    await render(<NotificationSettings initialPrefs={prefs} />);
    expect(host.textContent).toContain("bloqueadas en el navegador");
    expect(button("Activar notificaciones")).toBeUndefined();
  });

  test("iPhone outside the installed app: explains how to install", async () => {
    push.state = { ...push.state, ios: true, standalone: false };
    await render(<NotificationSettings initialPrefs={prefs} />);
    expect(host.textContent).toContain("Añadir a pantalla de inicio");
    expect(button("Activar notificaciones")).toBeUndefined();
  });

  test("unsupported browser says so", async () => {
    push.state = { ...push.state, supported: false };
    await render(<NotificationSettings initialPrefs={prefs} />);
    expect(host.textContent).toContain("no admite notificaciones");
  });

  test("a preference switch saves both values and confirms", async () => {
    await render(<NotificationSettings initialPrefs={prefs} />);
    const box = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0];
    await click(box);
    expect(savePrefs).toHaveBeenCalledWith({ bids: false, market: true });
    expect(host.textContent).toContain("Preferencias guardadas.");
    expect(box.checked).toBe(false);
  });

  test("a failed save puts the switch back and says so", async () => {
    savePrefs.mockResolvedValue({ error: "No se pudieron guardar las preferencias." });
    await render(<NotificationSettings initialPrefs={prefs} />);
    const box = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];
    await click(box);
    expect(box.checked).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("No se pudieron guardar las preferencias.");
  });

  test("the test button reports how many devices got the message", async () => {
    push.state = { ...push.state, permission: "granted", subscribed: true };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ devices: 2, delivered: 2 }), { status: 200 })));
    await render(<NotificationSettings initialPrefs={prefs} />);
    await click(button("Enviarme una prueba")!);
    expect(host.textContent).toContain("Prueba enviada a 2 dispositivos.");
  });

  test("a test that reaches nobody does not claim success", async () => {
    push.state = { ...push.state, permission: "granted", subscribed: true };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ devices: 1, delivered: 0 }), { status: 200 })));
    await render(<NotificationSettings initialPrefs={prefs} />);
    await click(button("Enviarme una prueba")!);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/no llegó a ningún dispositivo/);
  });

  test("a server error on the test is shown", async () => {
    push.state = { ...push.state, permission: "granted", subscribed: true };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Las notificaciones no están configuradas en el servidor." }), { status: 500 })));
    await render(<NotificationSettings initialPrefs={prefs} />);
    await click(button("Enviarme una prueba")!);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Las notificaciones no están configuradas en el servidor.");
  });
});
