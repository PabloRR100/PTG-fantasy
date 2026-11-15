import { ActivityFeed } from "@/components/ActivityFeed";
import { requireManager } from "@/lib/session";
import { getActivity } from "@/services/game-data";

export const metadata = { title: "Tablón · Padel Fantasy" };

export default async function TablonPage() {
  const { db } = await requireManager();
  const rows = await getActivity(db);

  return (
    <>
      <h1>Tablón</h1>
      <p className="lead">Lo que se mueve en la liga: fichajes y ventas al mercado, con su precio.</p>
      <ActivityFeed rows={rows} />
    </>
  );
}
