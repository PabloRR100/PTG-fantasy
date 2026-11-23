import type { Rpc } from "@/services/ingest";

export type IngestRun =
  | { machine: string; status: "ok"; matches_seen: number; matches_finished: number; results_written: number; players_skipped: number }
  | { machine: string; status: "failed"; step: IngestStep; error: string };

/** Where a failed run stopped: the browser scrape, the dry run that guards the write, or the write itself. */
export type IngestStep = "scrape" | "dry_run" | "write";

export const INGEST_STEPS: readonly IngestStep[] = ["scrape", "dry_run", "write"];

/** Writes one row of the import log (table ingest_runs, migration 0017). */
export async function recordIngestRun(rpc: Rpc, run: IngestRun): Promise<void> {
  const { error } = await rpc("record_ingest_run", { p_run: run });
  if (error) throw new Error(`record_ingest_run: ${error.message}`);
}

/** True when a run already went well on today's Madrid date, whichever machine did it. */
export async function ingestRanToday(rpc: Rpc): Promise<boolean> {
  const { data, error } = await rpc("ingest_ran_today", {});
  if (error) throw new Error(`ingest_ran_today: ${error.message}`);
  return data === true;
}
