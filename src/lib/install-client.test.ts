import { describe, expect, test } from "vitest";
import { INSTALL_SNOOZE_MS, isIos, shouldShowInstall } from "@/lib/install-client";

const base = { standalone: false, canPrompt: true, ios: false, snoozedUntil: null as number | null, now: 1_000_000 };

describe("shouldShowInstall", () => {
  test("a browser tab that can offer installation shows the banner", () => expect(shouldShowInstall(base)).toBe(true));
  test("an installed app (standalone) never shows it", () => expect(shouldShowInstall({ ...base, standalone: true })).toBe(false));
  test("a browser that cannot offer installation and is not iOS shows nothing (no action to give)", () => {
    expect(shouldShowInstall({ ...base, canPrompt: false })).toBe(false);
  });
  test("iOS Safari has no install prompt but can be taught the Share steps, so it shows the banner", () => {
    expect(shouldShowInstall({ ...base, canPrompt: false, ios: true })).toBe(true);
  });
  test("a dismissal hides it until the snooze is over", () => {
    expect(shouldShowInstall({ ...base, snoozedUntil: base.now + 1 })).toBe(false);
    expect(shouldShowInstall({ ...base, snoozedUntil: base.now })).toBe(true);
  });
  test("the snooze is a day", () => expect(INSTALL_SNOOZE_MS).toBe(24 * 60 * 60 * 1000));
});

describe("isIos", () => {
  test("recognizes iPhone and iPad", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5)).toBe(true);
  });
  test("recognizes an iPad that presents itself as a Mac (touch points)", () => expect(isIos("Mozilla/5.0 (Macintosh)", "MacIntel", 5)).toBe(true));
  test("a real Mac or an Android phone is not iOS", () => {
    expect(isIos("Mozilla/5.0 (Macintosh)", "MacIntel", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5)).toBe(false);
  });
});
