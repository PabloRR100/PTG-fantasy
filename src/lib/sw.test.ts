import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

// public/sw.js is a plain script. Run it against a minimal worker scope and fire its events.
type Handler = (event: Record<string, unknown>) => void;

function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const state = { windows: [] as { url: string }[], fetched: [] as { url: string; body: unknown }[], subscribeArgs: [] as unknown[] };

  const scope = {
    location: { origin: "https://padel-fantasy.betcomm.app" },
    addEventListener: (name: string, handler: Handler) => { handlers[name] = handler; },
    skipWaiting: () => Promise.resolve(),
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); return Promise.resolve(); },
      pushManager: {
        subscribe: (args: unknown) => { state.subscribeArgs.push(args); return Promise.resolve({ toJSON: () => ({ endpoint: "https://new/endpoint", keys: {} }) }); },
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(state.windows.map((w) => ({ ...w, focus: () => Promise.resolve(), navigate: (u: string) => { navigated.push(u); return Promise.resolve(); } }))),
      openWindow: (url: string) => { opened.push(url); return Promise.resolve(); },
    },
    fetch: undefined as unknown,
  };
  const fetchStub = (url: string, init: { body: string }) => { state.fetched.push({ url, body: JSON.parse(init.body) }); return Promise.resolve({ ok: true }); };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self: scope, URL, JSON, fetch: fetchStub, Promise });
  return { handlers, shown, opened, navigated, state };
}

/** An ExtendableEvent: collects the promise passed to waitUntil so the test can await it. */
function extendable(extra: Record<string, unknown> = {}) {
  const pending: Promise<unknown>[] = [];
  return { event: { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, ...extra }, settled: () => Promise.all(pending) };
}
const pushEvent = (payload: unknown) => extendable({ data: { json: () => payload, text: () => String(payload) } });

describe("service worker", () => {
  test("has no fetch handler (it must never sit between the page and the network)", () => {
    expect(loadWorker().handlers.fetch).toBeUndefined();
  });

  test("a push shows a notification with the title, body, icon and the page to open", async () => {
    const w = loadWorker();
    const e = pushEvent({ title: "¡Es tuyo!", body: "Has fichado a Kike.", url: "/equipo", tag: "t1" });
    w.handlers.push(e.event);
    await e.settled();
    expect(w.shown).toEqual([{ title: "¡Es tuyo!", options: expect.objectContaining({ body: "Has fichado a Kike.", tag: "t1", icon: "/brand/icon-192.png", data: { url: "/equipo" } }) }]);
  });

  test("a push with no usable payload still shows something readable", async () => {
    const w = loadWorker();
    const e = extendable({ data: null });
    w.handlers.push(e.event);
    await e.settled();
    expect(w.shown[0].title).toBe("Padel Fantasy");
    expect(w.shown[0].options.data).toEqual({ url: "/equipo" });
  });

  test("a payload that is not JSON does not crash the worker", async () => {
    const w = loadWorker();
    const e = extendable({ data: { json: () => { throw new SyntaxError("bad"); }, text: () => "texto suelto" } });
    w.handlers.push(e.event);
    await e.settled();
    expect(w.shown[0].options.body).toBe("texto suelto");
  });

  test("clicking opens the page in a new window when the app is closed", async () => {
    const w = loadWorker();
    const closed: boolean[] = [];
    const e = extendable({ notification: { close: () => closed.push(true), data: { url: "/mercado" } } });
    w.handlers.notificationclick(e.event);
    await e.settled();
    expect(closed).toEqual([true]);
    expect(w.opened).toEqual(["https://padel-fantasy.betcomm.app/mercado"]);
  });

  test("clicking reuses an open window of the app instead of opening another", async () => {
    const w = loadWorker();
    w.state.windows = [{ url: "https://padel-fantasy.betcomm.app/equipo" }];
    const e = extendable({ notification: { close: () => {}, data: { url: "/mercado" } } });
    w.handlers.notificationclick(e.event);
    await e.settled();
    expect(w.navigated).toEqual(["https://padel-fantasy.betcomm.app/mercado"]);
    expect(w.opened).toEqual([]);
  });

  test.each([["https://evil.example/phish"], ["//evil.example/phish"], ["javascript:alert(1)"], [42], [undefined]])(
    "a payload cannot send the click anywhere but this site (%s)",
    async (url) => {
      const w = loadWorker();
      const e = extendable({ notification: { close: () => {}, data: { url } } });
      w.handlers.notificationclick(e.event);
      await e.settled();
      expect(w.opened).toEqual(["https://padel-fantasy.betcomm.app/equipo"]);
    },
  );

  test("when the browser rotates the push credentials, the new subscription is stored and the old endpoint named", async () => {
    const w = loadWorker();
    const key = new Uint8Array([1, 2, 3]);
    const e = extendable({ oldSubscription: { endpoint: "https://old/endpoint", options: { applicationServerKey: key } } });
    w.handlers.pushsubscriptionchange(e.event);
    await e.settled();
    expect(w.state.subscribeArgs).toEqual([{ userVisibleOnly: true, applicationServerKey: key }]);
    expect(w.state.fetched).toEqual([{ url: "/api/push/subscription", body: { subscription: { endpoint: "https://new/endpoint", keys: {} }, previousEndpoint: "https://old/endpoint" } }]);
  });

  test("without the old key there is nothing to renew with, and nothing is attempted", async () => {
    const w = loadWorker();
    const e = extendable({ oldSubscription: null });
    w.handlers.pushsubscriptionchange(e.event);
    await e.settled();
    expect(w.state.fetched).toEqual([]);
  });
});
