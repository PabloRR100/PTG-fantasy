import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { requireManager } from "@/lib/session";
import { getJornada, getTeamJornada } from "@/services/game-data";
import { jornadaLabel, nextWeek, previousWeek } from "@/services/jornada";

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
            <thead>
              <tr>
                <th>Jugador</th>
                <th className="num" title="Días que fue titular esta jornada">Días</th>
                <th className="num" title="Puntos que sumaron al equipo: los días que era titular">Puntos</th>
                <th className="num" title="Puntos que hizo cuando no estaba convocado y no sumaron">Sin convocar</th>
              </tr>
            </thead>
            <tbody>
              {detail.players.map((p) => (
                <tr key={p.id}>
                  <td><span className={`chip color-${p.color}`}>{p.color}</span> {p.name}</td>
                  <td className="num">{p.daysCalled}</td>
                  <td className="num">{p.counted}</td>
                  <td className="num missed">{p.missed > 0 ? p.missed : "–"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td /><td className="num">{detail.counted}</td><td className="num missed">{detail.missed > 0 ? detail.missed : "–"}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="lead">«Sin convocar» son puntos de jugadores de la plantilla actual en días en que no eran titulares.</p>
    </>
  );
}
