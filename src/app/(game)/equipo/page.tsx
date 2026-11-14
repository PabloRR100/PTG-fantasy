import { LineupForm, SellButton } from "@/components/forms";
import { requireManager } from "@/lib/session";
import { COLORS } from "@/services/lineup";
import { getSquad } from "@/services/game-data";

export default async function EquipoPage() {
  const { db, userId } = await requireManager();
  const squad = await getSquad(db, userId);
  const perColor = (color: string) => squad.filter((p) => p.color === color).length;
  const cycleTotal = squad.filter((p) => p.starter).reduce((sum, p) => sum + p.cyclePoints, 0);

  return (
    <>
      <h1>Equipo</h1>
      <p className="lead">
        Elige 2 titulares de cada color. Hoy tus titulares suman <strong>{cycleTotal} pts</strong>.
      </p>
      <LineupForm
        squad={squad.map((p) => ({ id: p.id, color: p.color, name: p.display_name, value: p.value, cyclePoints: p.cyclePoints }))}
        starters={squad.filter((p) => p.starter).map((p) => p.id)}
      />

      <h2>Vender al mercado</h2>
      <p className="lead">Se paga al momento al valor actual. Debes conservar al menos 2 jugadores de cada color.</p>
      <ul className="plain">
        {squad.filter((p) => perColor(p.color) > 2).map((p) => (
          <li key={p.id} className="sell-row">
            <span className={`chip color-${p.color}`}>{p.color}</span> {p.display_name}
            <SellButton playerId={p.id} name={p.display_name} value={p.value} color={p.color} />
          </li>
        ))}
        {COLORS.every((c) => perColor(c) <= 2) && <li>No puedes vender a nadie: ya tienes el mínimo en cada color.</li>}
      </ul>
    </>
  );
}
