# PTG data notes

Verified 2026-11-14 by reading the logged-in PTG app (Madrid, men's). Raw captures live in `tmp/ptg-raw/` (gitignored: they hold real
names and signed image tokens). Fixtures committed under `tests/fixtures/ptg/` are trimmed and anonymized.

## Answers to GAMEPLAY section 9

| Question | Answer |
|---|---|
| Stable player id? | **Yes.** `/perfil/<uuid>` links. The ranking page links every row (`data-cta-id="ranking_to_player_profile"`). The match page links the 4 players, in order: pair A player 1, pair A player 2, pair B player 1, pair B player 2. |
| Id in the results list? | **No.** The list shows only names ("Mario", "Tú") and avatars. An avatar URL path `profile-photos/<uuid>/...` carries the id, but only for players who have a photo, so it cannot be relied on. The scraper must open each match page (`/partidos/<uuid>`) to get ids. |
| Super tie-break? | Not seen. In 9 matches every set is a single number per pair (e.g. `6`, `7`, `1`, `5`). **Unverified** for a third-set tie-break; the parser must reject a set whose value is above 7 loudly, not guess. |
| Walkover or unplayed? | Not seen in 9 matches (no "WO", "retirado", "no presentado"). **Unverified.** The parser treats a finished match with no sets as a walkover. |
| Year in dates? | **No.** `jue, 12 nov · 19:30` only. Infer the year from the scrape date (a date after "now" belongs to the previous year). Times are Europe/Madrid. |

## Structure facts

- Results list for a group: `/ranking/resultados?ciudad=<city>&grupo=<group>`. Each match is an `<a href="/partidos/<uuid>">`, with
  winners first, then losers, a score string per pair (one number per set), date and club.
- Match page shows "Set 1 2 · 6" = pair A games 2, pair B games 6. The pair order follows the `/perfil` links. Sets listed
  there are from pair A's point of view. The results list is winners-first, so it needs flipping when pair A lost.
- The viewer is marked: "Tú" in the list, "Pepo ·tú" on the match page. The name on the page is **"Pepo"**, not "Pepro". Never
  match on the string; resolve the viewer by the `·tú` marker plus the id.
- Ranking page: per player name, PJ (matches played) and ratio, one page per group and period (`scope=historico`).
- Avatar image URLs carry a signed token that expires. Never store them.

## Ids used by the pilot (Madrid, male)

| Level | `grupo` id |
|---|---|
| Blanco | `7bdccef6-c5aa-235a-fab5-ecebbae72a48` |
| Azul | `02fc6968-c20c-b113-950d-e428c888fb82` |
| Verde | `b91885bf-e9e6-020f-63bc-9c12c9e94764` |
| Rosa | `29d818ad-e3f5-953a-9a5c-795bd6e465fd` |
| Marrón (Pablo's group, results list sample) | `727cc31f-3be2-4754-a1fb-2ae956bc4fca` |

City Madrid: `e98f5188-7beb-2a97-0e79-7b6d55147209`. Fetching `/ranking/todas?ciudad=<city>&genero=male&nivel=<Color>&scope=historico`
without `grupo` resolves the group by itself.
