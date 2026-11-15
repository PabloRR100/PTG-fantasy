import { ClauseEditor, LineupForm, SellButton } from "@/components/forms";
import { formatMoney } from "@/lib/format";
import { clausePrice, isProtected, protectedUntilLabel } from "@/services/clause";
import { requireManager } from "@/lib/session";
import { LEVELS, levelOf } from "@/services/lineup";
import { getSquad } from "@/services/game-data";
import { squadValue } from "@/services/team-value";

export default async function EquipoPage() {
  const { db, userId, profile } = await requireManager();
  const squad = await getSquad(db, userId);
  const perLevel = (color: string) => squad.filter((p) => levelOf(p.color) === levelOf(color)).length;
  const cycleTotal = squad.filter((p) => p.starter).reduce((sum, p) => sum + p.cyclePoints, 0);

  return (
    <>
      <h1>Equipo</h1>
      <p className="lead">
        Elige 2 titulares de cada nivel (Azul y Blanco cuentan como uno). Hoy tus titulares suman <strong>{cycleTotal} pts</strong>.
      </p>
      <p className="lead">
        Valor del equipo: <strong>{formatMoney(squadValue(squad))}</strong> (toda la plantilla, suplentes incluidos; sin contar tu presupuesto).
      </p>
      <LineupForm
        squad={squad.map((p) => ({ id: p.id, color: p.color, name: p.display_name, value: p.value, cyclePoints: p.cyclePoints }))}
        starters={squad.filter((p) => p.starter).map((p) => p.id)}
      />

      <h2>Vender al mercado</h2>
      <p className="lead">Se paga al momento al valor actual. Debes conservar al menos 2 jugadores de cada nivel.</p>
      <ul className="plain">
        {squad.filter((p) => perLevel(p.color) > 2).map((p) => (
          <li key={p.id} className="sell-row">
            <span className={`chip color-${p.color}`}>{p.color}</span> {p.display_name}
            <SellButton playerId={p.id} name={p.display_name} value={p.value} color={p.color} />
          </li>
        ))}
        {LEVELS.every((l) => perLevel(l.colors[0]) <= 2) && <li>No puedes vender a nadie: ya tienes el mínimo en cada nivel.</li>}
      </ul>

      <h2>Cláusulas</h2>
      <p className="lead">
        Cualquier rival puede llevarse a uno de tus jugadores pagando su cláusula: el doble de su valor más lo que añadas aquí, y ese dinero es para ti.
        Subir la cláusula bloquea la mitad del aumento de tu presupuesto; al bajarla, te devuelve esa mitad. Máximo: el cuádruple del valor. Un jugador recién fichado está protegido 3 días: nadie puede pagar su cláusula.
        Si vendes un jugador al mercado, lo bloqueado en él no se devuelve: bájala antes. Tu saldo: <strong>{formatMoney(profile.budget)}</strong>.
      </p>
      <div className="table-wrap standings-wrap">
        <table className="standings">
          <thead><tr><th>Jugador</th><th className="num">Valor</th><th className="num">Cláusula</th><th>Blindaje</th></tr></thead>
          <tbody>
            {[...squad].sort((a, b) => b.value - a.value).map((p) => (
              <tr key={p.id}>
                <td><span className={`chip color-${p.color}`}>{p.color}</span> {p.display_name}</td>
                <td className="num">{formatMoney(p.value)}</td>
                <td className="num">{formatMoney(clausePrice(p.value, p.clauseExtra))}{isProtected(p.protectedUntil) && <small className="hint"><br />Nadie puede pagarla hasta {protectedUntilLabel(p.protectedUntil!)}</small>}</td>
                <td><ClauseEditor player={p.id} value={p.value} extra={p.clauseExtra} budget={profile.budget} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
