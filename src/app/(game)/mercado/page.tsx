import Link from "next/link";
import { MarketTable, type MarketRow } from "@/components/MarketTable";
import { formatMoney } from "@/lib/format";
import { requireManager } from "@/lib/session";
import { getOpenListings, getPlayerDirectory } from "@/services/game-data";

export default async function MercadoPage() {
  const { db, userId, profile } = await requireManager();
  const [{ listings, myBids }, directory] = await Promise.all([getOpenListings(db, userId), getPlayerDirectory(db)]);
  const byId = new Map(directory.map((row) => [row.id, row]));
  const rows: MarketRow[] = listings.flatMap((l) => {
    const row = byId.get(l.player.id);
    return row ? [{ ...row, listingId: l.id, myBid: l.myBid }] : [];
  });

  return (
    <>
      <h1>Mercado</h1>
      <p className="lead">
        La puja mínima es el valor del jugador y no puede superar tu presupuesto ({formatMoney(profile.budget)}).
        Cómo se resuelven las pujas, en las <Link href="/normas">normas de juego</Link>.
      </p>

      <h2>Subastas abiertas</h2>
      {rows.length === 0 ? (
        <p>No hay subastas abiertas ahora mismo. Vuelve pronto: se abren subastas nuevas cada día.</p>
      ) : (
        <MarketTable rows={rows} budget={profile.budget} />
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
