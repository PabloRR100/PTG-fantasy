import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ClauseForm } from "@/components/forms";
import { formatMoney } from "@/lib/format";
import { requireManager } from "@/lib/session";
import { clausePrice } from "@/services/clause";
import { getTeamView } from "@/services/game-data";

export const metadata = { title: "Equipo · Padel Fantasy" };

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A rival's team: its squad, who starts today and the release clause of every player. */
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId, profile } = await requireManager();
  if (id === userId) redirect("/equipo");
  if (!UUID.test(id)) notFound();
  const team = await getTeamView(db, id);
  if (!team) notFound();

  return (
    <>
      <p><Link href="/clasificacion">← Clasificación</Link></p>
      <h1 className="team-title"><Avatar url={team.avatar_url} name={team.team_name} size="sm" /> {team.team_name}</h1>
      <p className="lead">
        Valor de la plantilla: {formatMoney(team.teamValue)} · {team.players.length} jugadores · <Link href={`/jornada?equipo=${team.user_id}`}>Ver sus puntos por jornada</Link>
      </p>
      <p className="lead">
        Puedes llevarte a cualquiera pagando su cláusula, el doble de su valor. El dinero va a este equipo, que debe conservar al menos 2 jugadores de cada nivel. Tu saldo: {formatMoney(profile.budget)}.
      </p>
      {team.players.length === 0 ? <p className="empty-feed">Este equipo no tiene jugadores.</p> : (
        <div className="table-wrap standings-wrap">
          <table className="standings">
            <thead>
              <tr>
                <th>Jugador</th>
                <th title={team.lineupDate ? "Alineación que este equipo tenía a las 06:00 y puntúa hoy" : "Todavía no hay alineación guardada"}>Hoy</th>
                <th className="num">Valor</th>
                <th>Cláusula</th>
              </tr>
            </thead>
            <tbody>
              {team.players.map((p) => (
                <tr key={p.id} className={p.starter ? undefined : "bench-row"}>
                  <td><span className={`chip color-${p.color}`}>{p.color}</span> {p.name}</td>
                  <td>{p.starter ? "Titular" : "Banquillo"}</td>
                  <td className="num">{formatMoney(p.value)}</td>
                  <td><ClauseForm player={p.id} price={clausePrice(p.value)} name={p.name} budget={profile.budget} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
