import { PlayersTable } from "@/components/PlayersTable";
import { requireManager } from "@/lib/session";
import { getPlayerDirectory } from "@/services/game-data";

export const metadata = { title: "Jugadores · Padel Fantasy" };

export default async function JugadoresPage() {
  const { db } = await requireManager();
  const rows = await getPlayerDirectory(db);

  return (
    <>
      <h1>Jugadores</h1>
      <p className="lead">Todos los jugadores del fantasy, con su valor de mercado y el equipo que los tiene.</p>
      <PlayersTable rows={rows} />
    </>
  );
}
