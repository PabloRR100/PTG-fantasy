// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InstallBanner } from "@/components/InstallBanner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const setStandalone = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (q: string) => ({ matches: on && q.includes("standalone"), addEventListener() {}, removeEventListener() {} }) });
const setUa = (ua: string, platform = "Linux", touch = 0) => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: touch });
};
const mount = () => act(() => root.render(<InstallBanner />));
const offer = () => {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({ outcome: "accepted" as const }) });
  act(() => { window.dispatchEvent(event); });
  return event;
};

beforeEach(() => {
  localStorage.clear();
  setStandalone(false);
  setUa("Mozilla/5.0 (Linux; Android 14) Chrome/120");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("InstallBanner", () => {
  test("shows nothing until the browser offers installation", () => {
    mount();
    expect(host.querySelector("section")).toBeNull();
  });
  test("when the browser offers it, shows a banner whose button opens the install prompt", async () => {
    mount();
    const event = offer();
    expect(host.querySelector("section")!.textContent).toMatch(/Instala la app/);
    await act(async () => { host.querySelector<HTMLButtonElement>("button")!.click(); });
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });
  test("after installing, the banner goes away", async () => {
    mount();
    offer();
    await act(async () => { host.querySelector<HTMLButtonElement>("button")!.click(); });
    expect(host.querySelector("section")).toBeNull();
  });
  test("an installed app (standalone) never shows it", () => {
    setStandalone(true);
    mount();
    offer();
    expect(host.querySelector("section")).toBeNull();
  });
  test("dismissing hides it for a day and remembers it", () => {
    mount();
    offer();
    act(() => { host.querySelector<HTMLButtonElement>('button[aria-label="Recordarme mañana"]')!.click(); });
    expect(host.querySelector("section")).toBeNull();
    expect(Number(localStorage.getItem("padel-install-snoozed-until"))).toBeGreaterThan(Date.now());
    act(() => root.unmount());
    root = createRoot(host);
    mount();
    offer();
    expect(host.querySelector("section")).toBeNull();
  });
  test("on an iPhone it shows the banner with the Share steps instead of a prompt", () => {
    setUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604", "iPhone", 5);
    mount();
    expect(host.querySelector("section")).not.toBeNull();
    act(() => { host.querySelector<HTMLButtonElement>("button")!.click(); });
    expect(host.textContent).toMatch(/Añadir a pantalla de inicio/);
  });
});
