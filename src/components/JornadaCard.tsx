"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icons";
import { jornadaLabel, type JornadaFeedRow } from "@/services/jornada";

/** Rows a collapsed card still shows: the podium. */
export const PODIUM_PEEK = 3;

function Delta({ delta }: { delta: number }) {
  if (delta > 0) return <span className="delta delta-up">↑{delta}</span>;
  if (delta < 0) return <span className="delta delta-down">↓{-delta}</span>;
  return <span className="delta delta-flat">–</span>;
}

/**
 * A closed jornada in the Tablón, as Betcomm's matchday summary: the week big and the purpose small, the podium always
 * visible and the rest of the table behind a tap. Every row has week points, overall position and how it moved.
 */
export function JornadaCard({ row, timeLabel, defaultOpen = false }: { row: JornadaFeedRow; timeLabel: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = open ? row.entries : row.entries.slice(0, PODIUM_PEEK);
  return (
    <li className="feed-card feed-card-jornada">
      <div className="feed-body">
        <button type="button" className="jornada-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="trend-up" size={16} />
          <span className="jornada-title">
            <span className="jornada-round">Jornada {jornadaLabel(row.weekStart)}</span>
            {" - "}
            <span className="jornada-kicker">Clasificación</span>
            <time className="jornada-time" dateTime={row.created_at}>{timeLabel}</time>
          </span>
          <span className={`jornada-chevron${open ? " is-open" : ""}`} aria-hidden="true">▼</span>
        </button>
        <ol className="podium">
          {shown.map((e) => (
            <li key={e.user_id} className={e.points === 0 ? "is-idle" : undefined}>
              <span className="podium-rank">{e.rank}</span>
              <Avatar url={e.avatar_url} name={e.team} size="xs" />
              <span className="team-name">{e.team}</span>
              <span className="podium-points">{e.points === 0 ? "N/P" : `${e.points} pts`}</span>
              <span className="podium-overall">#{e.overallRank}</span>
              <Delta delta={e.delta} />
            </li>
          ))}
        </ol>
        {!open && row.entries.length > PODIUM_PEEK && (
          <p className="podium-more">+{row.entries.length - PODIUM_PEEK} más — toca para ver todos</p>
        )}
        <p className="feed-meta"><Link href={`/jornada?semana=${row.weekStart}`}>Ver los puntos de cada jugador</Link></p>
      </div>
    </li>
  );
}
