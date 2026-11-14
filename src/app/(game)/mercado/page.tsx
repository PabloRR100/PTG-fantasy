import Link from "next/link";
import { BidForm } from "@/components/forms";
import { formatMoney } from "@/lib/format";
import { requireManager } from "@/lib/session";
import { getOpenListings } from "@/services/game-data";

export default async function MercadoPage() {
  const { db, userId, profile } = await requireManager();
  const { listings, myBids } = await getOpenListings(db, userId);

  return (
    <>
      <h1>Mercado</h1>
      <p className="lead">
        La puja mínima es el valor del jugador y no puede superar tu presupuesto ({formatMoney(profile.budget)}).
        Cómo se resuelven las pujas, en las <Link href="/normas">normas de juego</Link>.
      </p>

      <h2>Subastas abiertas</h2>
      {listings.length === 0 ? (
        <p>No hay subastas abiertas ahora mismo. Vuelve pronto: se abren subastas nuevas cada día.</p>
      ) : (
        <ul className="plain cards">
          {listings.map((l) => (
            <li key={l.id} className="card">
              <div className="card-head">
                <span className={`chip color-${l.player.color}`}>{l.player.color}</span>
                <strong>{l.player.display_name}</strong>
              </div>
              <dl className="facts">
                <div><dt>Valor</dt><dd>{formatMoney(l.player.value)}</dd></div>
                <div><dt>Partidos</dt><dd>{l.player.matches_played}</dd></div>
                <div><dt>Victorias</dt><dd>{Math.round(l.player.ratio * 100)}%</dd></div>
              </dl>
              <BidForm listingId={l.id} minimum={l.player.value} budget={profile.budget} current={l.myBid} />
            </li>
          ))}
        </ul>
      )}

      <h2>Tus pujas</h2>
      {myBids.length === 0 ? (
        <p>Todavía no has pujado por nadie.</p>
      ) : (
        <table>
          <thead><tr><th>Jugador</th><th>Nivel</th><th className="num">Tu puja</th></tr></thead>
          <tbody>
            {myBids.map((b) => (
              <tr key={b.listingId}>
                <td>{b.playerName}</td>
                <td><span className={`chip color-${b.color}`}>{b.color}</span></td>
                <td className="num">{formatMoney(b.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
