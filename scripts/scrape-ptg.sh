#!/bin/bash
# Saves PTG's ranking, results and match pages (Madrid, men's, Blanco to Rosa) as HTML under tmp/scrape/.
# PTG needs a login and the sandbox blocks its domain, so every page is fetched by the logged-in cmux
# browser tab (nothing is stored but the HTML). Then run `npm run ingest`.
#
#   PTG_SURFACE=surface:181 scripts/scrape-ptg.sh [out_dir]      # find the surface: cmux list-pane-surfaces --pane <pane>
#   REFRESH=1 ...                                               # re-download match pages that already exist
#   SEASON_ID=<uuid> ...                                        # rankings of that semester (default: 1S27, Madrid)
#
# Rankings are read for ONE semester, not "historico": the historical table lists a player under every level
# they ever played in, and the game needs the level they play in now.
set -euo pipefail

: "${PTG_SURFACE:?Set PTG_SURFACE to the cmux surface of the logged-in PTG tab, e.g. PTG_SURFACE=surface:181}"
OUT="${1:-tmp/scrape}"
CITY="e98f5188-7beb-2a97-0e79-7b6d55147209"
SEASON_ID="${SEASON_ID:-66d67bef-114e-48d3-98a3-d6c53732411f}" # 1S27
GROUPS_BY_COLOR="Blanco:7bdccef6-c5aa-235a-fab5-ecebbae72a48 Azul:02fc6968-c20c-b113-950d-e428c888fb82 Verde:b91885bf-e9e6-020f-63bc-9c12c9e94764 Rosa:29d818ad-e3f5-953a-9a5c-795bd6e465fd"
mkdir -p "$OUT"

# fetch_page <path-and-query> <out-file>: same-origin fetch inside the browser tab, so its session cookie is used.
fetch_page() {
  cmux browser --surface "$PTG_SURFACE" eval "(async()=>{const r=await fetch('$1',{credentials:'include'});if(!r.ok||/\\/login/.test(r.url))throw new Error('PTG answered '+r.status+' at '+r.url+' (logged out?)');return await r.text()})()" > "$2"
  if ! grep -q '<html' "$2"; then
    echo "scrape-ptg: '$1' did not return a page (see $2). Is the PTG tab logged in?" >&2
    exit 1
  fi
}

for entry in $GROUPS_BY_COLOR; do
  color="${entry%%:*}"; group="${entry##*:}"
  echo "== $color"
  fetch_page "/ranking/todas?ciudad=$CITY&genero=male&nivel=$color&grupo=$group&scope=$SEASON_ID" "$OUT/ranking-$color.html"
  fetch_page "/ranking/resultados?ciudad=$CITY&grupo=$group" "$OUT/results-$color.html"
  ids=$(grep -o '/partidos/[0-9a-f-]\{36\}' "$OUT/results-$color.html" | sort -u | sed 's|/partidos/||')
  total=0; fetched=0
  for id in $ids; do
    total=$((total + 1))
    if [ -s "$OUT/match-$id.html" ] && [ -z "${REFRESH:-}" ]; then continue; fi
    fetch_page "/partidos/$id" "$OUT/match-$id.html"
    fetched=$((fetched + 1))
  done
  echo "   $total matches listed, $fetched downloaded"
done
echo "Done. Next: npm run ingest"
