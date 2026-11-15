#!/bin/bash
# The daily match import, end to end (docs/runbooks/match-sync.md): scrape results and matches through the logged-in
# league tab, show what would change, then write. Players and colors are never touched (--matches-only).
#
#   PTG_SURFACE=surface:53 scripts/daily-sync.sh
#
# Stops at the first problem and says which step failed. A logged-out tab fails in the scrape step, before anything is written.
set -euo pipefail
: "${PTG_SURFACE:?Set PTG_SURFACE to the cmux surface of the logged-in league tab (cmux list-pane-surfaces --pane <pane>)}"
OUT="tmp/scrape-matches"
cd "$(dirname "$0")/.."

echo "== 1/3 scrape"
PTG_SURFACE="$PTG_SURFACE" MATCHES_ONLY=1 scripts/scrape-ptg.sh "$OUT"

echo "== 2/3 dry run"
npm run --silent ingest -- "$OUT" --matches-only | tee "$OUT/dry-run.txt"
if ! grep -Eq "Matches saved: [0-9]+, finished [1-9]" "$OUT/dry-run.txt"; then echo "daily-sync: the dry run found no finished matches; not writing." >&2; exit 1; fi

echo "== 3/3 write"
npm run --silent ingest -- "$OUT" --matches-only --apply
echo "daily-sync: done."
