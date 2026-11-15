import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { formatMoney } from "@/lib/format";
import type { StandingRow } from "@/services/standings";

/** League table: rank, team (photo or initials, name), week, total and squad value. */
export function StandingsTable({ rows, myUserId }: { rows: StandingRow[]; myUserId: string }) {
  return (
    <div className="table-wrap standings-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Equipo</th>
            <th className="num">Semana</th>
            <th className="num">Total</th>
            <th className="num" title="Valor de mercado de toda la plantilla, suplentes incluidos">Valor del equipo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user_id} className={row.user_id === myUserId ? "me" : undefined}>
              <td>{row.rank}</td>
              <td>
                <Link className="team-cell" href={row.user_id === myUserId ? "/equipo" : `/equipos/${row.user_id}`} title="Ver su equipo">
                  <Avatar url={row.avatar_url} name={row.team_name} size="xs" />
                  <span className="team-name">{row.team_name}</span>
                </Link>
              </td>
              <td className="num">{row.week}</td>
              <td className="num">{row.total}</td>
              <td className="num">{formatMoney(row.teamValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
