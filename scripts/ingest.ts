// Loads the pages saved by scripts/scrape-ptg.sh into Supabase.
//   npm run ingest                      dry run: what would change, nothing is written
//   npm run ingest -- --apply           write (reads .env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
//   npm run ingest -- <dir> ...         another folder than tmp/scrape
//   --emit-payload=<file>               also save the players payload as JSON (to review it or load it by other means)
//   --matches-only                      only the matches (the daily/weekly run); players and colors are left alone
//   --allow-past-season                 accept rankings of a semester that is no longer running
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseMatchPage } from "../src/lib/ptg/parse-match";
import { buildMatchPayload, ingestMatch, ingestPlayers } from "../src/services/ingest";
import { planPlayers, summarizeChanges } from "../src/services/ingest-plan";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const DIR = args.find((a) => !a.startsWith("--")) ?? "tmp/scrape";
const APPLY = flag("--apply");
const MATCHES_ONLY = flag("--matches-only");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is empty. Fill it in .env (Supabase dashboard > Project Settings > API).`);
  return value;
}

function printPlan(plan: ReturnType<typeof planPlayers>) {
  const { resolved } = plan;
  console.log(`Semester ${plan.season} (running). Players per group: read / loadable into the game`);
  for (const g of resolved.perGroup) console.log(`  ${g.gender.padEnd(6)} ${g.level.padEnd(8)} ${String(g.read).padStart(3)} / ${String(g.loadable).padStart(3)}`);
  console.log(`Loadable: ${resolved.loadable.length}. Not loaded: ${resolved.ambiguous.length} ambiguous (in several groups), ${resolved.outOfGame.length} in colors the game does not play.`);
  for (const a of resolved.ambiguous) {
    console.log(`  ambiguous ${a.displayName} (${a.ptgPlayerId}): ${a.groups.map((g) => `${g.gender} ${g.level}`).join(" + ")}`);
  }
}

async function main() {
  if (!existsSync(DIR)) throw new Error(`${DIR} does not exist. Run scripts/scrape-ptg.sh first.`);
  const read = (name: string) => (existsSync(`${DIR}/${name}`) ? readFileSync(`${DIR}/${name}`, "utf8") : null);
  const plan = MATCHES_ONLY ? null : planPlayers(read, { allowPastSeason: flag("--allow-past-season") });
  if (plan) {
    printPlan(plan);
    const emit = option("--emit-payload");
    if (emit) writeFileSync(emit, JSON.stringify(plan.payload));
  }

  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  if (plan) {
    const stored = await supabase.from("players").select("ptg_player_id, color, gender").limit(10000);
    if (stored.error) throw new Error(`reading current players: ${stored.error.message}`);
    const changes = summarizeChanges(stored.data, plan.payload);
    console.log(`Against the database: ${changes.newPlayers} new, ${changes.colorChanged} change color, ${changes.genderChanged} change gender, ${changes.unchanged} unchanged, ${changes.notInRankings} stored but not in this semester's rankings (left as they are).`);
  }

  const now = new Date();
  const files = readdirSync(DIR).filter((f) => f.startsWith("match-") && f.endsWith(".html"));
  const parsed = files.map((file) => {
    const id = file.slice("match-".length, -".html".length);
    return buildMatchPayload(parseMatchPage(readFileSync(`${DIR}/${file}`, "utf8"), id, now));
  });
  const finished = parsed.filter((p): p is NonNullable<typeof p> => p !== null);
  const dates = finished.map((m) => m.played_at).sort();
  console.log(`Matches saved: ${files.length}, finished ${finished.length}, not finished ${files.length - finished.length}${dates.length ? `; played ${dates[0]} to ${dates[dates.length - 1]}` : ""}.`);

  if (!APPLY) {
    console.log("Dry run: nothing written. Re-run with --apply to load it.");
    return;
  }
  const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn, args);

  if (plan) {
    // One call for every player, so a color change is applied at once and the lineups are repaired once, on the final colors.
    const written = await ingestPlayers(rpc, plan.payload);
    // Whoever is in no ranking of this semester is not part of the game: out of squads and the market, history kept.
    const inactive = await rpc("deactivate_absent_players", { p_present: plan.presentIds });
    if (inactive.error) throw new Error(`deactivate_absent_players: ${inactive.error.message}`);
    console.log(`inactive: ${JSON.stringify(inactive.data)}`);
    const repair = await rpc("repair_lineups", {});
    console.log(`players: ${written} written. Lineups: ${JSON.stringify(repair.data)} (impossible = a squad with fewer than 2 players of some color)`);
  }

  let inserted = 0;
  let skippedPlayers = 0;
  for (const payload of finished) {
    const result = await ingestMatch(rpc, payload);
    inserted += result.inserted;
    skippedPlayers += result.skipped;
  }
  const unfinished = files.length - finished.length;
  // Once the results are in, tell the managers how a finished jornada ended (a week is announced once; nothing otherwise).
  const announced = await rpc("announce_closed_jornadas", {});
  if (announced.error) throw new Error(`announce_closed_jornadas: ${announced.error.message}`);
  console.log(`jornada notifications queued: ${announced.data}`);
  console.log(`matches: ${files.length - unfinished} ingested, ${unfinished} not finished; ${inserted} player results written, ${skippedPlayers} skipped (players not loaded into the game)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
