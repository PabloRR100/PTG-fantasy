import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keeps profiles.avatar_url equal to the photo of the signed-in session, so the other participants can see it
 * without anyone reading auth data. The database re-validates the value (set_my_avatar), so this never has to be
 * trusted. A failure is logged, not thrown: a photo must not break a page.
 */
export async function syncAvatar(db: SupabaseClient, stored: string | null, fromSession: string | null): Promise<void> {
  if (stored === fromSession) return;
  const { error } = await db.rpc("set_my_avatar", { p_url: fromSession });
  if (error) console.error(`set_my_avatar: ${error.message}`);
}
