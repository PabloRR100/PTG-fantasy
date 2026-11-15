// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { UpdateBanner } from "@/components/UpdateBanner";

vi.mock("@/lib/build-id", () => ({ BUILD_ID: "dpl_old" }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const reload = vi.fn();

function setup({ installed, deployed }: { installed: boolean; deployed: string }) {
  window.matchMedia = ((q: string) => ({ matches: installed && q.includes("standalone"), addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ id: deployed }) })));
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
}
const mount = async () => { await act(async () => { root.render(<UpdateBanner />); }); };

beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); reload.mockReset(); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("UpdateBanner", () => {
  test("the installed app offers to update when the server runs another build, and reloads on tap", async () => {
    setup({ installed: true, deployed: "dpl_new" });
    await mount();
    expect(host.textContent).toContain("Nueva versión disponible");
    act(() => host.querySelector("button")!.click());
    expect(reload).toHaveBeenCalled();
  });
  test("says nothing when it is the same build", async () => {
    setup({ installed: true, deployed: "dpl_old" });
    await mount();
    expect(host.textContent).toBe("");
  });
  test("a browser tab is not nagged and does not even ask", async () => {
    setup({ installed: false, deployed: "dpl_new" });
    await mount();
    expect(host.textContent).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });
});
