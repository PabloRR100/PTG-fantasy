import { NotificationSettings } from "@/components/NotificationSettings";
import { requireManager } from "@/lib/session";
import { getNotificationPrefs } from "@/services/game-data";

export const metadata = { title: "Ajustes · Padel Fantasy" };

export default async function AjustesPage() {
  const { db, userId } = await requireManager();
  const prefs = await getNotificationPrefs(db, userId);

  return (
    <>
      <h1>Ajustes</h1>
      <p className="lead">Elige cuándo quieres que te avisemos.</p>
      <NotificationSettings initialPrefs={prefs} />
    </>
  );
}
