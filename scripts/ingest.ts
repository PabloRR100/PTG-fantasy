// Loads the pages saved by scripts/scrape-ptg.sh into Supabase.
//   npm run ingest                      dry run: what would change, nothing is written
//   npm run ingest -- --apply           write (reads .env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
//   npm run ingest -- <dir> ...         another folder than tmp/scrape
//   --emit-payload=<file>               also save the players payload as JSON (to review it or load it by other means)
//   --matches-only                      only the matches (the daily/weekly run); players and colors are left alone
//   --allow-past-season                 accept rankings of a semester that is no longer running
//   --ran-today                         print "yes" or "no": did a run go well today (Madrid)? Nothing is read or written
//   --record-failure=<step> --reason=<text>   log a failed run (step: scrape | dry_run | write) and stop; --apply logs its own runs
//   PTG_MACHINE=<name>                  how the log names this machine (default: the hostname)
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { parseMatchPage } from "../src/lib/ptg/parse-match";
import { buildMatchPayload, ingestMatch, ingestPlayers } from "../src/services/ingest";
import { planPlayers, summarizeChanges } from "../src/services/ingest-plan";
import { INGEST_STEPS, ingestRanToday, recordIngestRun, type IngestStep } from "../src/services/ingest-runs";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const DIR = args.find((a) => !a.startsWith("--")) ?? "tmp/scrape";
const APPLY = flag("--apply");
const MATCHES_ONLY = flag("--matches-only");
const MACHINE = process.env.PTG_MACHINE ?? hostname();

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

function serviceClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

/** The two commands that only touch the run log (the fallback machine and daily-sync.sh use them). Returns true when it handled one. */
async function runLogCommand(): Promise<boolean> {
  const rpc = (fn: string, a: Record<string, unknown>) => serviceClient().rpc(fn, a);
  if (flag("--ran-today")) {
    console.log((await ingestRanToday(rpc)) ? "yes" : "no");
    return true;
  }
  const step = option("--record-failure");
  if (step !== undefined) {
    if (!INGEST_STEPS.includes(step as IngestStep)) throw new Error(`--record-failure=${step}: the step must be one of ${INGEST_STEPS.join(", ")}.`);
    const error = option("--reason");
    if (!error) throw new Error("--record-failure needs --reason=<what went wrong>.");
    await recordIngestRun(rpc, { machine: MACHINE, status: "failed", step: step as IngestStep, error });
    console.log(`logged a failed run at ${step}.`);
    return true;
  }
  return false;
}

async function main() {
  if (await runLogCommand()) return;
  if (!existsSync(DIR)) throw new Error(`${DIR} does not exist. Run scripts/scrape-ptg.sh first.`);
  const read = (name: string) => (existsSync(`${DIR}/${name}`) ? readFileSync(`${DIR}/${name}`, "utf8") : null);
  const plan = MATCHES_ONLY ? null : planPlayers(read, { allowPastSeason: flag("--allow-past-season") });
  if (plan) {
    printPlan(plan);
    const emit = option("--emit-payload");
    if (emit) writeFileSync(emit, JSON.stringify(plan.payload));
  }

  const supabase = serviceClient();
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

  let inserted = 0;
  let skippedPlayers = 0;
  try {
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
  } catch (e) {
    // A write that broke halfway is on the log too; the log must not hide the original error if it cannot be written.
    const error = e instanceof Error ? e.message : String(e);
    await recordIngestRun(rpc, { machine: MACHINE, status: "failed", step: "write", error }).catch((logError) => console.error(`could not log the failed run: ${logError.message}`));
    throw e;
  }
  // Outside the try: if only the log fails, the data is written and the run must not be logged as a failed write.
  await recordIngestRun(rpc, { machine: MACHINE, status: "ok", matches_seen: files.length, matches_finished: finished.length, results_written: inserted, players_skipped: skippedPlayers });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
