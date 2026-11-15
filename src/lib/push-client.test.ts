import { describe, expect, test } from "vitest";
import { SNOOZE_MS, shouldShowReminder, type ReminderInput } from "@/lib/push-client";

const NOW = 1_800_000_000_000;
const eligible: ReminderInput = { supported: true, permission: "default", subscribed: false, snoozedUntil: null, now: NOW, ios: false, standalone: false };

describe("shouldShowReminder", () => {
  test("shown when the browser can push, nobody has been asked yet and this device has no subscription", () => {
    expect(shouldShowReminder(eligible)).toBe(true);
  });
  test.each([
    ["the browser cannot push", { supported: false }],
    ["permission was granted already", { permission: "granted" as const }],
    ["permission was denied (nagging cannot change that)", { permission: "denied" as const }],
    ["this device is already subscribed", { subscribed: true }],
    ["it was dismissed and the snooze has not ended", { snoozedUntil: NOW + 1000 }],
  ])("hidden when %s", (_name, over) => {
    expect(shouldShowReminder({ ...eligible, ...over })).toBe(false);
  });
  test("shown again once the snooze ends", () => {
    expect(shouldShowReminder({ ...eligible, snoozedUntil: NOW })).toBe(true);
    expect(shouldShowReminder({ ...eligible, snoozedUntil: NOW - 1 })).toBe(true);
  });
  test("on iPhone only inside the installed app, since Safari cannot push otherwise", () => {
    expect(shouldShowReminder({ ...eligible, ios: true, standalone: false })).toBe(false);
    expect(shouldShowReminder({ ...eligible, ios: true, standalone: true })).toBe(true);
  });
  test("the snooze lasts a week", () => expect(SNOOZE_MS).toBe(7 * 24 * 60 * 60 * 1000));
});
