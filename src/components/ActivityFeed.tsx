import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icons";
import { formatMoney } from "@/lib/format";
import { describeActivity, groupByDay, timeAgo, type ActivityRow } from "@/services/feed";
import { GENDER_LABEL } from "@/services/player-directory";
import { JornadaCard } from "@/components/JornadaCard";
import type { JornadaFeedRow } from "@/services/jornada";

/**
 * The Tablón, as Betcomm lays it out: the days as separators (Hoy, Ayer, then the date) and one card per event whose
 * look follows its kind: a signing and a sale to the market are different cards, with the price on the right.
 */
export function ActivityFeed({ rows, jornadas = [], now = new Date() }: { rows: ActivityRow[]; jornadas?: JornadaFeedRow[]; now?: Date }) {
  const items = [...rows, ...jornadas].sort((a, b) => b.created_at.localeCompare(a.created_at));
  // As in Betcomm, the newest closed jornada opens with the whole table; older ones show their podium.
  const latestJornada = [...jornadas].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id;
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
                return <JornadaCard key={row.id} row={row} timeLabel={timeAgo(row.created_at, now)} defaultOpen={row.id === latestJornada} />;
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
