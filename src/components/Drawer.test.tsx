// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let pathname = "/equipo";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/app/actions", () => ({ signOut: async () => {} }));

import { Drawer } from "@/components/Drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function render(props: Partial<React.ComponentProps<typeof Drawer>> = {}) {
  act(() => {
    root.render(<Drawer teamName="Los Pepros" budget="5.000.000 €" avatarUrl={null} isAdmin={false} {...props} />);
  });
}
const $ = (selector: string) => host.querySelector<HTMLElement>(selector)!;
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init })); });

beforeEach(() => {
  pathname = "/equipo";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.style.overflow = "";
});

describe("Drawer", () => {
  test("starts closed and unreachable", () => {
    render();
    expect($(".avatar-button").getAttribute("aria-expanded")).toBe("false");
    expect($("#game-menu").hasAttribute("inert")).toBe(true);
    expect($("#game-menu").classList.contains("is-open")).toBe(false);
  });

  test("the avatar opens it, locks page scroll and moves focus inside", () => {
    render();
    act(() => $(".avatar-button").click());
    expect($(".avatar-button").getAttribute("aria-expanded")).toBe("true");
    expect($("#game-menu").hasAttribute("inert")).toBe(false);
    expect($("#game-menu").classList.contains("is-open")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect($("#game-menu").contains(document.activeElement)).toBe(true);
  });

  test("Escape closes it and gives focus back to the avatar", () => {
    render();
    act(() => $(".avatar-button").click());
    press("Escape");
    expect($("#game-menu").classList.contains("is-open")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe($(".avatar-button"));
  });

  test("clicking outside the panel closes it", () => {
    render();
    act(() => $(".avatar-button").click());
    act(() => $(".drawer-overlay").click());
    expect($("#game-menu").classList.contains("is-open")).toBe(false);
  });

  test("the close button closes it", () => {
    render();
    act(() => $(".avatar-button").click());
    act(() => $(".drawer-close").click());
    expect($("#game-menu").classList.contains("is-open")).toBe(false);
  });

  test("navigating to another page closes it", () => {
    render();
    act(() => $(".avatar-button").click());
    pathname = "/normas";
    render();
    expect($("#game-menu").classList.contains("is-open")).toBe(false);
  });

  test("Tab wraps inside the open menu in both directions", () => {
    render();
    act(() => $(".avatar-button").click());
    const items = Array.from($("#game-menu").querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    items[items.length - 1].focus();
    press("Tab");
    expect(document.activeElement).toBe(items[0]);
    press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  test("lists the game pages, with Normas de juego, and marks the current one", () => {
    render();
    const links = Array.from($("#game-menu").querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Tablón", "/tablon"], ["Buzón", "/buzon"], ["Equipo", "/equipo"], ["Mercado", "/mercado"], ["Jugadores", "/jugadores"], ["Clasificación", "/clasificacion"], ["Normas de juego", "/normas"], ["Ajustes", "/ajustes"],
    ]);
    expect($('a[aria-current="page"]').textContent).toBe("Equipo");
  });

  test("Administración appears only for admins", () => {
    render({ isAdmin: true });
    expect(Array.from($("#game-menu").querySelectorAll("a")).map((a) => a.textContent)).toContain("Administración");
  });

  test("offers sign out", () => {
    render();
    expect($(".drawer-foot button").textContent).toBe("Cerrar sesión");
  });

  test("shows the profile photo when there is one", () => {
    render({ avatarUrl: "https://example.com/me.png" });
    expect($(".avatar-button img").getAttribute("src")).toBe("https://example.com/me.png");
    expect($(".avatar-button img").getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  test("falls back to the team's initials without a photo", () => {
    render();
    expect($(".avatar-button").textContent).toBe("LP");
  });

  test("falls back to initials when the photo fails to load", () => {
    render({ avatarUrl: "https://example.com/broken.png" });
    act(() => { $(".avatar-button img").dispatchEvent(new Event("error")); });
    expect($(".avatar-button img")).toBeNull();
    expect($(".avatar-button").textContent).toBe("LP");
  });
});
