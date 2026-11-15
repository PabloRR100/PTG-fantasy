import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icons";
import { formatMoney } from "@/lib/format";
import { describeActivity, groupByDay, timeAgo, type ActivityRow } from "@/services/feed";
import { GENDER_LABEL } from "@/services/player-directory";
import { jornadaLabel, type JornadaFeedRow } from "@/services/jornada";

/**
 * The Tablón, as Betcomm lays it out: the days as separators (Hoy, Ayer, then the date) and one card per event whose
 * look follows its kind: a signing and a sale to the market are different cards, with the price on the right.
 */
export function ActivityFeed({ rows, jornadas = [], now = new Date() }: { rows: ActivityRow[]; jornadas?: JornadaFeedRow[]; now?: Date }) {
  const items = [...rows, ...jornadas].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (items.length === 0) {
    return <p className="empty-feed">Todavía no hay movimientos. Aparecerán aquí los fichajes y las ventas al mercado.</p>;
  }
  return (
    <div className="feed-days">
      {groupByDay(items, now).map((day) => (
        <section key={day.key} className="day-group" aria-label={day.label}>
          <div className="day-line"><span className="day-separator">{day.label}</span></div>
          <ul className="feed">
            {day.rows.map((row) => {
              if (row.kind === "jornada") {
                return (
                  <li key={row.id} className="feed-card feed-card-jornada">
                    <div className="feed-body">
                      <p className="feed-kind"><Icon name="trend-up" size={14} />Jornada cerrada · {jornadaLabel(row.weekStart)}</p>
                      <ol className="podium">
                        {row.podium.map((p) => (
                          <li key={p.user_id}><span className="podium-rank">{p.rank}</span><Avatar url={p.avatar_url} name={p.team} size="xs" /><span className="team-name">{p.team}</span><span className="podium-points">{p.points} pts</span></li>
                        ))}
                      </ol>
                      <p className="feed-meta"><Link href={`/jornada?semana=${row.weekStart}`}>Ver la clasificación y los puntos de cada equipo</Link><time dateTime={row.created_at}>{timeAgo(row.created_at, now)}</time></p>
                    </div>
                  </li>
                );
              }
              const { icon, heading, text } = describeActivity(row);
              return (
                <li key={row.id} className={`feed-card feed-card-${row.kind}`}>
                  <Avatar url={row.avatar_url} name={row.team ?? "?"} size="sm" />
                  <div className="feed-body">
                    <p className="feed-kind"><Icon name={icon} size={14} />{heading}</p>
                    <p>{text}</p>
                    <p className="feed-meta">
                      <span className={`chip color-${row.color} is-${row.gender}`} title={GENDER_LABEL[row.gender]}>{row.color}</span>
                      <time dateTime={row.created_at}>{timeAgo(row.created_at, now)}</time>
                    </p>
                  </div>
                  <span className="feed-amount">{formatMoney(row.amount)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
