import { StandingsTable } from "@/components/StandingsTable";
import { requireManager } from "@/lib/session";
import { getStandings } from "@/services/game-data";

export default async function ClasificacionPage() {
  const { db, userId } = await requireManager();
  const table = await getStandings(db);

  return (
    <>
      <h1>Clasificación</h1>
      <p className="lead">Puntos de los titulares que tenías a las 06:00 de cada día. La semana va de lunes a domingo.</p>
      <StandingsTable rows={table} myUserId={userId} />
    </>
  );
}
