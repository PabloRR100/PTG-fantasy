#!/bin/bash
# The daily match import, end to end (docs/runbooks/match-sync.md): scrape results and matches through the logged-in
# league tab, show what would change, then write. Players and colors are never touched (--matches-only).
#
#   PTG_SURFACE=surface:53 scripts/daily-sync.sh
#   SKIP_IF_DONE=1 PTG_SURFACE=... scripts/daily-sync.sh     # the fallback machine: does nothing if a run already went well today
#
# Stops at the first problem and says which step failed. A logged-out tab fails in the scrape step, before anything is written.
# Every run, good or bad, is logged in the ingest_runs table (the write step logs itself; the other steps are logged here).
set -euo pipefail
: "${PTG_SURFACE:?Set PTG_SURFACE to the cmux surface of the logged-in league tab (cmux list-pane-surfaces --pane <pane>)}"
OUT="tmp/scrape-matches"
cd "$(dirname "$0")/.."
mkdir -p "$OUT"
LOG="$OUT/step.log"

# The step that is running when the script dies ("" once the write has started: ingest.ts logs that one itself).
STEP=""
log_failure() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -n "$STEP" ]; then
    local reason
    reason=$(tail -n 3 "$LOG" 2>/dev/null | tr '\n' ' ' | cut -c1-400)
    npm run --silent ingest -- --record-failure="$STEP" --reason="${reason:-exited with $rc}" > /dev/null 2>&1 || echo "daily-sync: could not log the failed $STEP step." >&2
  fi
}
trap log_failure EXIT

if [ -n "${SKIP_IF_DONE:-}" ]; then
  # If the question itself fails (no network, no .env) the answer is not "yes", so this machine goes on and runs.
  if [ "$(npm run --silent ingest -- --ran-today 2> /dev/null || true)" = "yes" ]; then
    echo "daily-sync: a run already went well today; nothing to do."
    exit 0
  fi
fi

STEP="scrape"
echo "== 1/3 scrape"
PTG_SURFACE="$PTG_SURFACE" MATCHES_ONLY=1 scripts/scrape-ptg.sh "$OUT" 2>&1 | tee "$LOG"

STEP="dry_run"
echo "== 2/3 dry run"
npm run --silent ingest -- "$OUT" --matches-only 2>&1 | tee "$LOG" "$OUT/dry-run.txt"
if ! grep -Eq "Matches saved: [0-9]+, finished [1-9]" "$OUT/dry-run.txt"; then
  echo "daily-sync: the dry run found no finished matches; not writing." | tee -a "$LOG" >&2
  exit 1
fi

STEP=""
echo "== 3/3 write"
npm run --silent ingest -- "$OUT" --matches-only --apply
echo "daily-sync: done."
