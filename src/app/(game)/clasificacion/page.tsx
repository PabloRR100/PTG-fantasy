import { requireManager } from "@/lib/session";
import { getStandings } from "@/services/game-data";

export default async function ClasificacionPage() {
  const { db, userId } = await requireManager();
  const table = await getStandings(db);

  return (
    <>
      <h1>Clasificación</h1>
      <p className="lead">Puntos de los titulares que tenías a las 06:00 de cada día. La semana va de lunes a domingo.</p>
      <table>
        <thead><tr><th>#</th><th>Equipo</th><th className="num">Semana</th><th className="num">Total</th></tr></thead>
        <tbody>
          {table.map((row) => (
            <tr key={row.user_id} className={row.user_id === userId ? "me" : undefined}>
              <td>{row.rank}</td>
              <td>{row.team_name}</td>
              <td className="num">{row.week}</td>
              <td className="num">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
