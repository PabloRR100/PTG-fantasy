/**
 * The profile photo from the sign-in provider's metadata (Google sends `avatar_url` and `picture`).
 * Only https URLs are accepted: the value comes from outside and ends up in an <img src>.
 */
export function safeAvatarUrl(metadata: Record<string, unknown> | undefined): string | null {
  for (const key of ["avatar_url", "picture"]) {
    const value = metadata?.[key];
    if (typeof value !== "string") continue;
    try {
      if (new URL(value).protocol === "https:") return value;
    } catch {
      // Not an absolute URL (empty, protocol-relative, garbage): try the next key.
    }
  }
  return null;
}

/** Up to two initials for the avatar fallback, from the team name. */
export function initialsOf(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0].toUpperCase());
  return letters.length > 0 ? letters.join("") : "?";
}
