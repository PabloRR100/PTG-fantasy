# PTG Fantasy: pilot design

**Date:** 2026-11-14 · **Status:** awaiting approval · **Size:** project

## Intent
Show the owners of Padel Team Gourmet (PTG) a working fantasy game built on their own league, to win a data export or API
(their option C). Players are friends from one PTG city and gender group. The game rules are in `docs/GAMEPLAY.md`.

## Goals
- A clickable game with **real PTG data**: sign-in with Google, Equipo (squad and lineup), Mercado (bids), Clasificación.
- Real scoring computed from real match results.
- Same infrastructure as Betcomm: Next.js on Vercel, Supabase (project `amlqvzmjiobvbhvbfdfi`), domain `ptg-fantasy.betcomm.app`.

## Non-goals (pilot)
- Automatic daily scraping, push notifications, other cities, women's league, colors beyond Blanco to Rosa.
- Money, payments, or public sign-up.

## Anti-goals
- Anything that looks invented: fake players or fake scores would undercut the demo.
- Storing PTG credentials. The pilot uses a logged-in browser session and keeps no password.

## Constraints
- PTG needs a login. This machine's sandbox blocks `app.padelteamgourmet.com`, and `registry.npmjs.org`, so installs and
  scraping run outside it (cmux browser tab for PTG; a cmux split for `npm`).
- The lockfile must use `registry.npmjs.org`, never `npm.apple.com`, or Vercel cannot build.
- Product copy is Spanish; code, docs and commits are English.

## Approaches considered
| Option | Trade-off |
|---|---|
| 1. Pure mock | Fast, but invented data sells nothing to PTG |
| **2. Real data, manual market close (chosen)** | Real players, matches, scoring and writes; the 06:00 close is a SQL function run by `pg_cron`, with an admin button for the demo |
| 3. Fully automatic | Needs the PTG session on a schedule; this is what an API from PTG would solve |

## Design
**Data flow:** PTG (browser session) -> local scraper -> Supabase tables -> Next.js pages.

**Tables (first cut):** `players`, `ptg_matches`, `match_players`, `profiles`, `squads`, `lineups`, `market_listings`,
`bids`, `value_history`, `cycles`. Points are derived from `match_players`, not stored as a source of truth.

**Surfaces:** `Equipo`, `Mercado`, `Clasificación`, plus an admin page with "close the market now". Surfaces stay thin; the
scoring and market rules live in one `services` layer with unit tests (the same rule must not exist in two places).

**The 06:00 close is one SQL function, `close_cycle()`, scheduled with Supabase `pg_cron`** (Betcomm schedules its
crons from Vercel instead; this differs on purpose). Resolving bids moves budgets and ownership, so it must be one
transaction that locks what it touches, as Betcomm's migration 214 does for bets. The admin button and the cron call the
same function. `pg_cron` runs in UTC and Madrid is UTC+1 or +2, so the job fires at 04:00 and 05:00 UTC and the function
only acts when it is 06:00 Madrid and no cycle row exists for that day, which also makes a double fire harmless.
The `pg_cron` extension must be enabled in the project (to verify; not yet checked).

**Scraper:** reads `/ranking/resultados?...&grupo=<id>` and each match page; resolves the viewer's "Tú" to Pablo ("Pepro",
Marrón); upserts idempotently so re-running never double-counts a match.

## Decisions Pablo made
Google sign-in like Betcomm; subdomain of betcomm.app; option 2; option A for data (his browser session), option C asked of PTG.

## Assistant's calls (check these)
1. Madrid, men's only, Blanco to Rosa.
2. All numbers in `GAMEPLAY.md` (points, 12-player squad, 8 starters, 5,000,000 budget, 06:00 cycle).
3. Daily lineup snapshot at 06:00 to decide which lineup a match scores for.
4. No point multiplier per color in v0.
5. Review by a second reader skipped to leave time before the afternoon demo.

## Left to the builder
Exact schema and RLS policies; UI layout (use Betcomm's tokens); how the scraper confirms stable player ids
(`GAMEPLAY.md` section 9 lists the open facts to verify first).

## Verification
Scraper run twice yields identical rows; one hand-checked match scores as in `GAMEPLAY.md` section 4; a bid tie resolves to
the earlier bid; a real login on `ptg-fantasy.betcomm.app` lands on Equipo.
