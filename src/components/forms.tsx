"use client";

import { useActionState, useState } from "react";
import {
  closeMarket, createTeam, placeBid, saveLineup, sellPlayer, type ActionState,
} from "@/app/actions";
import { formatMoney } from "@/lib/format";
import { LEVELS, levelOf, lineupProblem, toggleStarter, type Color, type SquadPlayer } from "@/services/lineup";

const NONE: ActionState = {};

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="msg msg-error">{state.error}</p>;
  if (state.ok) return <p role="status" className="msg msg-ok">{state.ok}</p>;
  return null;
}

export function CreateTeamForm() {
  const [state, action, pending] = useActionState(createTeam, NONE);
  return (
    <form action={action} className="stack">
      <label htmlFor="team">Nombre del equipo</label>
      <input id="team" name="team" required minLength={2} maxLength={30} autoComplete="off" placeholder="Los Pepros" />
      <button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear equipo"}</button>
      <Feedback state={state} />
    </form>
  );
}

export type LineupPlayer = SquadPlayer & { name: string; value: number; cyclePoints: number };

export function LineupForm({ squad, starters }: { squad: LineupPlayer[]; starters: string[] }) {
  const [selected, setSelected] = useState(starters);
  const [state, action, pending] = useActionState(saveLineup, NONE);
  const problem = lineupProblem(selected, squad);

  return (
    <form action={action} className="stack">
      {LEVELS.map((level) => (
        <fieldset key={level.name} className={`color-group color-${level.colors[0]}`}>
          <legend>{level.name}</legend>
          {squad.filter((p) => levelOf(p.color) === level.name).map((p) => {
            const on = selected.includes(p.id);
            return (
              <label key={p.id} className={`player ${on ? "is-starter" : ""}`}>
                <input type="checkbox" checked={on} onChange={() => setSelected(toggleStarter(selected, p.id, squad))} />
                {on && <input type="hidden" name="player" value={p.id} />}
                {level.colors.length > 1 && <span className={`chip color-${p.color}`}>{p.color}</span>}
                <span className="player-name">{p.name}</span>
                <span className="player-meta">{formatMoney(p.value)}</span>
                <span className="player-points" title="Puntos en el ciclo actual">{p.cyclePoints} pts</span>
              </label>
            );
          })}
        </fieldset>
      ))}
      <div className="actions">
        <button type="submit" disabled={pending || problem !== null}>{pending ? "Guardando…" : "Guardar alineación"}</button>
        {problem && <span className="hint">{problem}</span>}
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function SellButton({ playerId, name, value, color }: { playerId: string; name: string; value: number; color: Color }) {
  const [state, action, pending] = useActionState(sellPlayer, NONE);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="player" value={playerId} />
      <button
        type="submit"
        className="secondary"
        disabled={pending}
        onClick={(e) => { if (!window.confirm(`¿Vender a ${name} (${color}) al mercado por ${formatMoney(value)}?`)) e.preventDefault(); }}
      >
        Vender por {formatMoney(value)}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function BidForm({ listingId, minimum, budget, current }: { listingId: string; minimum: number; budget: number; current: number | null }) {
  const [state, action, pending] = useActionState(placeBid, NONE);
  return (
    <form action={action} className="bid-form">
      <input type="hidden" name="listing" value={listingId} />
      <label className="visually-hidden" htmlFor={`bid-${listingId}`}>Cantidad en euros</label>
      <input id={`bid-${listingId}`} name="amount" type="number" inputMode="numeric" step={10000} min={minimum} max={budget} defaultValue={current ?? minimum} required />
      <button type="submit" disabled={pending || minimum > budget}>{current === null ? "Pujar" : "Subir puja"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function CloseMarketButton() {
  const [state, action, pending] = useActionState(closeMarket, NONE);
  return (
    <form action={action} className="stack">
      <button type="submit" disabled={pending} onClick={(e) => { if (!window.confirm("¿Cerrar el mercado ahora? Se resuelven las pujas y no se puede deshacer.")) e.preventDefault(); }}>
        {pending ? "Cerrando…" : "Cerrar mercado ahora"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
