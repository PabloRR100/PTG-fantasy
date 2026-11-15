#!/bin/bash
# Saves PTG's ranking, results and match pages (Madrid, men's and women's) as HTML under tmp/scrape/.
# PTG needs a login and the sandbox blocks its domain, so every page is fetched by the logged-in cmux browser tab
# (nothing is stored but the HTML). Then run `npm run ingest` (a dry run by default).
#
#   PTG_SURFACE=surface:181 scripts/scrape-ptg.sh [out_dir]      # find the surface: cmux list-pane-surfaces --pane <pane>
#   REFRESH=1 ...                                               # re-download match pages that already exist
#   SEASON_ID=<uuid> ...                                        # rankings of that semester (default: 1S27, Madrid)
#   MATCHES_ONLY=1 ...                                          # the daily/weekly run: results and matches (the rankings are read only for their group ids)
#   RANKINGS_ONLY=1 ...                                         # only the 20 rankings (to refresh colors), no results or matches
#
# Rankings are read for ONE semester, not "historico": the historical table lists a player under every level
# they ever played in, and the game needs the level they play in now. ALL ten levels and both genders are read,
# including the colors the game does not play: a player listed in a game group and in another one is ambiguous,
# and only reading the other groups shows it. Results and matches are fetched for all groups.
# The ingest checks every page says it is the running semester ("En curso") before loading anything.
set -euo pipefail

: "${PTG_SURFACE:?Set PTG_SURFACE to the cmux surface of the logged-in PTG tab, e.g. PTG_SURFACE=surface:181}"
OUT="${1:-tmp/scrape}"
CITY="e98f5188-7beb-2a97-0e79-7b6d55147209"
SEASON_ID="${SEASON_ID:-66d67bef-114e-48d3-98a3-d6c53732411f}" # 1S27
LEVELS="Blanco Azul Verde Rosa Oro Granate Morado Marrón Plata Naranja"
mkdir -p "$OUT"

# fetch_page <path-and-query> <out-file>: same-origin fetch inside the browser tab, so its session cookie is used.
fetch_page() {
  cmux browser --surface "$PTG_SURFACE" eval "(async()=>{const r=await fetch('$1',{credentials:'include'});if(!r.ok||/\\/login/.test(r.url))throw new Error('PTG answered '+r.status+' at '+r.url+' (logged out?)');return await r.text()})()" > "$2"
  if ! grep -q '<html' "$2"; then
    echo "scrape-ptg: '$1' did not return a page (see $2). Is the PTG tab logged in?" >&2
    exit 1
  fi
}

# The URL needs the level percent-encoded (Marrón).
encode() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }

for gender in male female; do
  for level in $LEVELS; do
    file="$OUT/ranking-$gender-$level.html"
    echo "== $gender $level"
    fetch_page "/ranking/todas?ciudad=$CITY&genero=$gender&nivel=$(encode "$level")&scope=$SEASON_ID" "$file"
    [ -n "${RANKINGS_ONLY:-}" ] && continue
    # The group id is the one in the page's own "resultados" link.
    group=$(grep -o 'ranking/resultados?[^"]*grupo=[0-9a-f-]\{36\}' "$file" | head -1 | grep -o '[0-9a-f-]\{36\}$' || true)
    if [ -z "$group" ]; then echo "scrape-ptg: no results link in $file, cannot find the group" >&2; exit 1; fi
    fetch_page "/ranking/resultados?ciudad=$CITY&genero=$gender&nivel=$(encode "$level")&grupo=$group" "$OUT/results-$gender-$level.html"
    ids=$(grep -o '/partidos/[0-9a-f-]\{36\}' "$OUT/results-$gender-$level.html" | sort -u | sed 's|/partidos/||')
    total=0; fetched=0
    for id in $ids; do
      total=$((total + 1))
      if [ -s "$OUT/match-$id.html" ] && [ -z "${REFRESH:-}" ]; then continue; fi
      fetch_page "/partidos/$id" "$OUT/match-$id.html"
      fetched=$((fetched + 1))
    done
    echo "   $total matches listed, $fetched downloaded"
  done
done
echo "Done. Next: npm run ingest   (dry run; add -- --apply to write)"
