import { InboxList } from "@/components/InboxList";
import { requireManager } from "@/lib/session";
import { getInbox } from "@/services/game-data";
import { inboxEntry } from "@/services/feed";

export const metadata = { title: "Buzón · Padel Fantasy" };

export default async function BuzonPage() {
  const { db, userId } = await requireManager();
  const entries = (await getInbox(db, userId)).map(inboxEntry);

  return (
    <>
      <h1>Buzón</h1>
      <p className="lead">Tus avisos: pujas ganadas o perdidas y la apertura del mercado.</p>
      <InboxList entries={entries} />
    </>
  );
}
