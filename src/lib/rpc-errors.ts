import { formatMoney } from "@/lib/format";

const GENERIC = "No se pudo completar la acción. Inténtalo de nuevo.";

const TRANSLATIONS: { pattern: RegExp; say: (m: RegExpMatchArray) => string }[] = [
  { pattern: /^clause extra out of range \(maximum (\d+)\)/, say: (m) => `La cláusula extra debe ser un múltiplo de 10.000 € y no superar ${formatMoney(Number(m[1]))}.` },
  { pattern: /^clause unavailable/, say: () => "Ese jugador ya no está disponible en ese equipo." },
  { pattern: /^clause price changed/, say: () => "La cláusula ha cambiado. Actualiza la página para ver el precio." },
  { pattern: /^clause insufficient budget/, say: () => "No tienes saldo suficiente para pagar la cláusula." },
  { pattern: /^clause squad minimum/, say: () => "Ese equipo debe conservar al menos 2 jugadores de ese nivel." },
  { pattern: /^bid is below the market value \(minimum (\d+)\)/, say: (m) => `La puja está por debajo del valor de mercado: el mínimo es ${formatMoney(Number(m[1]))}.` },
  { pattern: /^bid is above your budget \((\d+)\)/, say: (m) => `La puja supera tu presupuesto (${formatMoney(Number(m[1]))}).` },
  { pattern: /^listing is not open/, say: () => "Esta subasta ya está cerrada." },
  { pattern: /^player already has a team/, say: () => "Ese jugador ya ha fichado por un equipo: la subasta no cuenta." },
  { pattern: /^create your team first/, say: () => "Primero crea tu equipo." },
  { pattern: /^not signed in/, say: () => "Tu sesión ha caducado. Vuelve a entrar." },
  { pattern: /^lineup needs exactly 2 players per color/, say: () => "La alineación necesita exactamente 2 titulares de cada nivel (18 en total)." },
  { pattern: /^player .* is not in your squad|^player is not in your squad/, say: () => "Ese jugador no está en tu plantilla." },
  { pattern: /^you need at least 2 players of each color/, say: () => "Debes conservar al menos 2 jugadores de cada nivel." },
  { pattern: /^user already has a team/, say: () => "Ya tienes un equipo." },
  { pattern: /^not enough free players/, say: () => "Ahora mismo no quedan jugadores libres para formar un equipo. Avisa al administrador." },
  { pattern: /^admin only/, say: () => "Solo el administrador puede hacer esto." },
];

/** Spanish text for a Postgres error raised by our RPCs. Unknown errors get a generic line, never raw SQL. */
export function rpcMessage(raw: string): string {
  for (const { pattern, say } of TRANSLATIONS) {
    const match = raw.match(pattern);
    if (match) return say(match);
  }
  return GENERIC;
}

/** Mirrors the `profiles.team_name` check (2 to 30 characters) so the manager gets a clear message first. */
export function validateTeamName(raw: FormDataEntryValue | null): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 2 || name.length > 30) {
    return { ok: false, error: "El nombre del equipo debe tener entre 2 y 30 caracteres." };
  }
  return { ok: true, name };
}
