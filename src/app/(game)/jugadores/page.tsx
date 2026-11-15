import { ClausePlayersTable } from "@/components/ClausePlayersTable";
import { requireManager } from "@/lib/session";
import { getPlayerDirectory } from "@/services/game-data";

export const metadata = { title: "Jugadores · Padel Fantasy" };

export default async function JugadoresPage() {
  const { db, profile } = await requireManager();
  const rows = await getPlayerDirectory(db);

  return (
    <>
      <h1>Jugadores</h1>
      <p className="lead">Todos los jugadores del fantasy, con su valor de mercado y el equipo que los tiene. Si ya tiene dueño, puedes pagar su cláusula (el doble de su valor).</p>
      <ClausePlayersTable rows={rows} myTeam={profile.team_name} budget={profile.budget} />
    </>
  );
}
