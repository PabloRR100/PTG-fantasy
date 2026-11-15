import { ActivityFeed } from "@/components/ActivityFeed";
import { requireManager } from "@/lib/session";
import { getActivity, getJornadaFeed } from "@/services/game-data";

export const metadata = { title: "Tablón · Padel Fantasy" };

export default async function TablonPage() {
  const { db } = await requireManager();
  const [rows, jornadas] = await Promise.all([getActivity(db), getJornadaFeed(db)]);

  return (
    <>
      <h1>Tablón</h1>
      <p className="lead">Lo que se mueve en la liga: fichajes, ventas al mercado y el podio de cada jornada.</p>
      <ActivityFeed rows={rows} jornadas={jornadas} />
    </>
  );
}
