/** An open app is out of date when the server reports a different build than the one it was loaded with. "dev" never is. */
export function needsUpdate(loaded: string, deployed: unknown): boolean {
  return loaded !== "dev" && typeof deployed === "string" && deployed !== "" && deployed !== loaded;
}

/** How often an open app asks which build is deployed (it also asks whenever it comes back to the foreground). */
export const UPDATE_CHECK_MS = 5 * 60 * 1000;
