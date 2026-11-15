// When to offer "install the app": only from a browser tab, only when it can do something about it, and not again
// for a day after a dismissal. Same rules as Betcomm's InstallBanner.

export const INSTALL_SNOOZE_KEY = "padel-install-snoozed-until";
export const INSTALL_SNOOZE_MS = 24 * 60 * 60 * 1000;

export type InstallInput = {
  /** Already running as an installed app. */
  standalone: boolean;
  /** The browser fired `beforeinstallprompt`: it can show its own install dialog. */
  canPrompt: boolean;
  ios: boolean;
  snoozedUntil: number | null;
  now: number;
};

export function shouldShowInstall(input: InstallInput): boolean {
  if (input.standalone) return false;
  if (!input.canPrompt && !input.ios) return false; // nothing the banner could do
  return input.snoozedUntil === null || input.now >= input.snoozedUntil;
}

/** iPhone, iPad, and an iPad that reports itself as a Mac (it has a touch screen). */
export function isIos(userAgent: string, platform: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
}

export function readInstallSnooze(): number | null {
  const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(INSTALL_SNOOZE_KEY);
  const until = raw === null ? NaN : parseInt(raw, 10);
  return Number.isNaN(until) ? null : until;
}

export function snoozeInstall(now = Date.now()) {
  localStorage.setItem(INSTALL_SNOOZE_KEY, String(now + INSTALL_SNOOZE_MS));
}
