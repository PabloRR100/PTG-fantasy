import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeAvatarUrl } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type Profile } from "@/services/game-data";

/** The signed-in user's id and photo. The proxy already bounces anonymous visitors; this is the second lock. */
export async function requireSession(db: SupabaseClient): Promise<{ userId: string; avatarUrl: string | null }> {
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return { userId: claims.sub, avatarUrl: safeAvatarUrl(claims.user_metadata as Record<string, unknown> | undefined) };
}

export async function requireUserId(db: SupabaseClient): Promise<string> {
  return (await requireSession(db)).userId;
}

/** Client, user and team for a game page; sends users without a team to onboarding. */
export async function requireManager(): Promise<{ db: SupabaseClient; userId: string; avatarUrl: string | null; profile: Profile }> {
  const db = await createClient();
  const { userId, avatarUrl } = await requireSession(db);
  const profile = await getProfile(db, userId);
  if (!profile) redirect("/onboarding");
  return { db, userId, avatarUrl, profile };
}
