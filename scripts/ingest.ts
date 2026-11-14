// Loads the pages saved by scripts/scrape-ptg.sh into Supabase.
//   npm run ingest            (reads .env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseMatchPage } from "../src/lib/ptg/parse-match";
import { parseRanking } from "../src/lib/ptg/parse-ranking";
import { buildMatchPayload, buildPlayersPayload, ingestMatch, ingestPlayers } from "../src/services/ingest";
import type { Color } from "../src/services/valuation";

const DIR = process.argv[2] ?? "tmp/scrape";
const GROUP_BY_COLOR: Record<Color, string> = {
  Blanco: "7bdccef6-c5aa-235a-fab5-ecebbae72a48",
  Azul: "02fc6968-c20c-b113-950d-e428c888fb82",
  Verde: "b91885bf-e9e6-020f-63bc-9c12c9e94764",
  Rosa: "29d818ad-e3f5-953a-9a5c-795bd6e465fd",
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is empty. Fill it in .env (Supabase dashboard > Project Settings > API).`);
  return value;
}

async function main() {
  if (!existsSync(DIR)) throw new Error(`${DIR} does not exist. Run scripts/scrape-ptg.sh first.`);
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn, args);

  // Players first, so a match between two groups finds everyone it needs.
  for (const color of Object.keys(GROUP_BY_COLOR) as Color[]) {
    const ranking = parseRanking(readFileSync(`${DIR}/ranking-${color}.html`, "utf8"));
    const written = await ingestPlayers(rpc, buildPlayersPayload(ranking, color, GROUP_BY_COLOR[color]));
    console.log(`${color}: ${ranking.length} players read, ${written} written`);
  }

  const now = new Date();
  const files = readdirSync(DIR).filter((f) => f.startsWith("match-") && f.endsWith(".html"));
  let inserted = 0;
  let skippedPlayers = 0;
  let unfinished = 0;
  for (const file of files) {
    const id = file.slice("match-".length, -".html".length);
    const payload = buildMatchPayload(parseMatchPage(readFileSync(`${DIR}/${file}`, "utf8"), id, now));
    if (!payload) {
      unfinished += 1;
      continue;
    }
    const result = await ingestMatch(rpc, payload);
    inserted += result.inserted;
    skippedPlayers += result.skipped;
  }
  console.log(`matches: ${files.length - unfinished} ingested, ${unfinished} not finished; ${inserted} player results written, ${skippedPlayers} skipped (players outside Blanco-Rosa)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
