import { buildNotification, type NotificationKind } from "@/services/notifications";
import type { Color } from "@/services/lineup";
import type { Gender } from "@/services/player-directory";

/** A row of the Tablón: one operation between a team and the market, with the names already joined in. */
export type ActivityRow = {
  id: number;
  kind: "signed" | "sold";
  /** null when the team was deleted after the operation (its rows go with it, so this is only a safety net). */
  team: string | null;
  /** The team owner's shared photo (profiles.avatar_url), or null. */
  avatar_url: string | null;
  player: string;
  color: Color;
  gender: Gender;
  amount: number;
  created_at: string;
};

export function describeActivity(row: ActivityRow): { icon: "signed" | "sold"; heading: string; text: string } {
  const team = row.team ?? "Un equipo";
  if (row.kind === "signed") return { icon: "signed", heading: "Fichaje", text: `${team} ha fichado a ${row.player}` };
  return { icon: "sold", heading: "Venta al mercado", text: `${team} ha vendido a ${row.player} al mercado` };
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "ahora", "hace 30 min", "hace 3 h", "ayer", "hace 3 días", then the date. */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return `${then.getUTCDate()} ${MONTHS[then.getUTCMonth()]}`;
}

export type InboxRow = { id: number; kind: NotificationKind; data: Record<string, unknown>; created_at: string; read_at: string | null };
export type InboxEntry = { id: number; title: string; body: string; href: string; created_at: string; unread: boolean };

/** An inbox line uses the same words the push notification used. */
export function inboxEntry(row: InboxRow): InboxEntry {
  const payload = buildNotification({ id: row.id, user_id: "", kind: row.kind, data: row.data });
  return { id: row.id, title: payload.title, body: payload.body, href: payload.url, created_at: row.created_at, unread: row.read_at === null };
}

const madridDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date(iso)); // YYYY-MM-DD

/** Newest-first rows split into days (Madrid calendar), each with "Hoy", "Ayer" or "jue, 12 nov", as Betcomm's Tablón does. */
export function groupByDay(rows: ActivityRow[], now = new Date()): { key: string; label: string; rows: ActivityRow[] }[] {
  const today = madridDay(now.toISOString());
  const yesterday = madridDay(new Date(now.getTime() - 86_400_000).toISOString());
  const days: { key: string; label: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const key = madridDay(row.created_at);
    let day = days.find((d) => d.key === key);
    if (!day) {
      const label = key === today ? "Hoy" : key === yesterday ? "Ayer"
        : new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" }).format(new Date(row.created_at)).replace(".", "").replace(/ de /g, " ");
      day = { key, label, rows: [] };
      days.push(day);
    }
    day.rows.push(row);
  }
  return days;
}
