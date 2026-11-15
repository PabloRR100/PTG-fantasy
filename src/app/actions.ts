"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rpcMessage, validateTeamName } from "@/lib/rpc-errors";
import type { Prefs } from "@/services/notifications";

// Server actions are the write surface of the pages. Each one is a thin call to a SQL function:
// ownership, money and the lineup rule are enforced there, never here.

export type ActionState = { error?: string; ok?: string };

async function callRpc(name: string, args: Record<string, unknown>): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (!error) return null;
  console.error(`rpc ${name} failed: ${error.message}`);
  return rpcMessage(error.message);
}

export async function createTeam(_prev: ActionState, form: FormData): Promise<ActionState> {
  const team = validateTeamName(form.get("team"));
  if (!team.ok) return { error: team.error };
  const error = await callRpc("create_manager", { p_team: team.name });
  if (error) return { error };
  redirect("/equipo");
}

export async function saveLineup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const players = form.getAll("player").filter((v): v is string => typeof v === "string");
  const error = await callRpc("set_lineup", { p_players: players });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Alineación guardada." };
}

export async function sellPlayer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const error = await callRpc("sell_player", { p_player: String(form.get("player") ?? "") });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Jugador vendido al mercado." };
}

export async function placeBid(_prev: ActionState, form: FormData): Promise<ActionState> {
  const amount = Number(form.get("amount"));
  if (!Number.isInteger(amount) || amount <= 0) return { error: "Escribe una cantidad válida en euros." };
  const error = await callRpc("place_bid", { p_listing: String(form.get("listing") ?? ""), p_amount: amount });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Puja registrada." };
}

export async function payReleaseClause(_prev: ActionState, form: FormData): Promise<ActionState> {
  const price = Number(form.get("price"));
  if (!Number.isSafeInteger(price) || price <= 0) return { error: "Cláusula no válida." };
  const error = await callRpc("pay_release_clause", { p_player: String(form.get("player") ?? ""), p_price: price });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Cláusula pagada. El jugador ya está en tu equipo." };
}

export async function closeMarket(): Promise<ActionState> {
  const error = await callRpc("admin_close_market", {});
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Mercado cerrado: pujas resueltas, alineaciones guardadas y subastas nuevas abiertas." };
}

export async function markNotificationsRead(): Promise<void> {
  const error = await callRpc("mark_notifications_read", {});
  if (error) console.error(`mark_notifications_read: ${error}`);
  revalidatePath("/", "layout");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function saveNotificationPrefs(prefs: Prefs): Promise<ActionState> {
  if (typeof prefs?.bids !== "boolean" || typeof prefs?.market !== "boolean" || typeof prefs?.jornada !== "boolean") return { error: "Preferencias no válidas." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: "Tu sesión ha caducado. Vuelve a entrar." };
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ user_id: userId, bids: prefs.bids, market: prefs.market, jornada: prefs.jornada, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error(`saveNotificationPrefs failed: ${error.message}`);
    return { error: "No se pudieron guardar las preferencias. Inténtalo de nuevo." };
  }
  revalidatePath("/ajustes");
  return { ok: "Preferencias guardadas." };
}
