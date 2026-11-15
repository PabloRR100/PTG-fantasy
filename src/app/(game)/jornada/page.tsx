import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { requireManager } from "@/lib/session";
import { getJornada, getTeamJornada } from "@/services/game-data";
import { jornadaLabel, jornadaRows, nextWeek, previousWeek } from "@/services/jornada";

export const metadata = { title: "Jornada · Padel Fantasy" };

const href = (week: string, team: string) => `/jornada?semana=${week}&equipo=${team}`;

export default async function JornadaPage({ searchParams }: { searchParams: Promise<{ semana?: string; equipo?: string }> }) {
  const { semana, equipo } = await searchParams;
  const { db, userId } = await requireManager();
  const view = await getJornada(db, semana ?? null);
  const teamId = view.ranking.some((r) => r.user_id === equipo) ? (equipo as string) : userId;
  const team = view.ranking.find((r) => r.user_id === teamId);
  const detail = await getTeamJornada(db, teamId, view.weekStart);
  const older = view.weeks.includes(previousWeek(view.weekStart)) ? previousWeek(view.weekStart) : null;
  const newer = view.weeks.includes(nextWeek(view.weekStart)) ? nextWeek(view.weekStart) : null;

  return (
    <>
      <h1>Jornada</h1>
      <nav className="week-nav" aria-label="Jornada">
        {older ? <Link href={href(older, teamId)} aria-label="Jornada anterior">‹</Link> : <span aria-hidden="true">‹</span>}
        <strong>{jornadaLabel(view.weekStart)}</strong>
        {newer ? <Link href={href(newer, teamId)} aria-label="Jornada siguiente">›</Link> : <span aria-hidden="true">›</span>}
      </nav>
      <p className="lead">Pulsa un equipo para ver a quién tenía convocado y cuántos puntos le dio cada jugador.</p>

      <div className="table-wrap standings-wrap">
        <table className="standings">
          <thead><tr><th>#</th><th>Equipo</th><th className="num">Puntos</th></tr></thead>
          <tbody>
            {view.ranking.map((row) => (
              <tr key={row.user_id} className={row.user_id === teamId ? "me" : undefined}>
                <td>{row.rank}</td>
                <td>
                  <Link className="team-cell" href={href(view.weekStart, row.user_id)} aria-current={row.user_id === teamId ? "true" : undefined}>
                    <Avatar url={row.avatar_url ?? null} name={row.team_name} size="xs" />
                    <span className="team-name">{row.team_name}</span>
                  </Link>
                </td>
                <td className="num">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{team?.team_name}{teamId === userId ? " (tú)" : ""}</h2>
      {detail.players.length === 0 ? (
        <p className="empty-feed">Este equipo no tuvo titulares ni puntos esta jornada.</p>
      ) : (
        <div className="table-wrap standings-wrap">
          <table className="standings">
            <thead><tr><th>Jugador</th><th className="num">Puntos</th></tr></thead>
            <tbody>
              {jornadaRows(detail).map((row) => (
                <tr key={row.key} className={row.counted ? undefined : "bench-row"}>
                  <td>
                    <span className={`chip color-${row.color}`}>{row.color}</span> {row.name}
                    {row.counted ? null : <small className="bench-tag"> · no convocado</small>}
                  </td>
                  <td className="num">{row.points}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Puntos del equipo</td><td className="num">{detail.counted}</td></tr></tfoot>
          </table>
        </div>
      )}
      {teamId !== userId && (
        <p className="lead"><Link href={`/equipos/${teamId}`}>Ver su plantilla y pagar cláusulas</Link></p>
      )}
      <p className="lead">Las filas sombreadas son jugadores de su plantilla actual que puntuaron en días en que no eran titulares: no suman al equipo.</p>
    </>
  );
}
