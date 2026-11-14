# PTG Fantasy Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clickable PTG Fantasy at `ptg-fantasy.betcomm.app`: Google sign-in, Equipo, Mercado, Clasificación, built on real scraped PTG data (Madrid, men's, Blanco to Rosa).

**Architecture:** Pure TypeScript services (`src/services/`) own scoring, cycles and valuation. Postgres owns the market: one SQL function `close_cycle()` resolves bids and snapshots lineups, run by `pg_cron` and by an admin button. A local scraper reads PTG through the cmux browser session and upserts into Supabase with the service role. Pages are thin.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Supabase (`@supabase/ssr`), Vitest, `node-html-parser`, Vercel, `pg_cron`.

**Spec:** `docs/superpowers/specs/2026-11-14-ptg-fantasy-design.md`, rules in `docs/GAMEPLAY.md`.

## Global Constraints

- Product copy Spanish; code, docs, commits English.
- Install npm packages only with `--registry=https://registry.npmjs.org/` and **inside a cmux split** (the sandbox blocks the registry); `grep -c npm.apple.com package-lock.json` must print `0`.
- `app.padelteamgourmet.com` is reachable only via the cmux browser tab (surface of "PTG App"); never write PTG credentials anywhere.
- Scoring (GAMEPLAY §4): +2 played, +4 won, +1 per set won, -1 per set lost, floor 0, walkover = 0 and not played.
- Cycle (GAMEPLAY §3): closes 06:00 `Europe/Madrid`; a match belongs to the cycle whose boundary is at or before its start.
- Squad 12 (3 per color), lineup 8 (2 per color), colors Blanco, Azul, Verde, Rosa, starting budget 5,000,000.
- Bid tie: earliest bid wins. Surfaces stay thin; rules live in `src/services/` or SQL, never duplicated.
- Commit steps run only after Pablo approves executing this plan. No `Co-Authored-By`, no AI footer.

## Review Focus

- Two players share a display name ("Mario" in Blanco and in Marrón): they must stay two players.
- A match scraped twice, or a scraper run twice: no duplicate rows, no doubled points.
- A walkover or a match with no score: scores 0, not counted as played.
- `close_cycle()` fired twice, or at 05:00 UTC in winter and 04:00 UTC in summer: acts once, only at 06:00 Madrid.
- The winning bidder can no longer afford the bid at 06:00: the next bidder gets the player and no budget goes negative.

## File Structure

| Path | Responsibility |
|---|---|
| `src/services/scoring.ts` | `scoreMatch`, points for one player in one match |
| `src/services/cycles.ts` | `cycleDateFor`, maps a timestamp to its 06:00 Madrid cycle |
| `src/services/valuation.ts` | `initialValue`, `nextValue` |
| `src/lib/ptg/parse-results.ts`, `parse-ranking.ts` | HTML to normalized objects, no I/O |
| `scripts/scrape-ptg.sh`, `scripts/ingest.ts` | drive the cmux tab, upsert into Supabase |
| `supabase/migrations/0001_core.sql` | tables, RLS, `create_manager`, `close_cycle`, `pg_cron` |
| `supabase/tests/close_cycle.sql` | SQL assertions for the market |
| `src/app/(game)/equipo`, `mercado`, `clasificacion`, `admin` | pages |
| `tests/fixtures/ptg/` | saved real PTG HTML, the scraper's ground truth |

---

### Task 1: Test harness and baseline commit

**Files:** Modify `package.json`; Create `vitest.config.ts`, `src/services/.gitkeep`.

**Produces:** `npm test` runs Vitest; alias `@/` resolves to `src/`.

- [ ] **Step 1:** In a cmux split, `npm install --registry=https://registry.npmjs.org/ -D vitest node-html-parser`, then add script `"test": "vitest run"`.
- [ ] **Step 2:** `vitest.config.ts` with `resolve.alias['@'] = './src'`, environment `node`.
- [ ] **Step 3:** Run `npm test`; expected: "No test files found", exit 0 with `--passWithNoTests`. Run `grep -c npm.apple.com package-lock.json`; expected `0`.
- [ ] **Step 4:** Commit scaffold, docs, spec and plan: `chore: scaffold Next + Supabase auth, docs and plan`.

### Task 2: Scoring service

**Files:** Create `src/services/scoring.ts`; Test `src/services/scoring.test.ts`.

**Produces:** `type SetResult = { mine: number; theirs: number }`; `type MatchInput = { sets: SetResult[]; walkover: boolean }`; `type MatchScore = { played: boolean; won: boolean; setsWon: number; setsLost: number; points: number }`; `scoreMatch(input: MatchInput): MatchScore`.

- [ ] **Step 1:** Tests, one per GAMEPLAY §4 row: `[6-3,6-4]` gives 8; `[6-3,3-6,6-3]` gives 7; `[3-6,6-3,4-6]` gives 1; `[3-6,4-6]` gives 0; `{sets: [], walkover: true}` gives `played:false, points:0`. A match is won when sets won exceed sets lost.
- [ ] **Step 2:** Run `npx vitest run src/services/scoring.test.ts`; expected FAIL (module missing).
- [ ] **Step 3:** Implement `scoreMatch`; a set is won when `mine > theirs`.
- [ ] **Step 4:** Run again; expected 5 passed. Commit `feat: match scoring service`.

### Task 3: Cycle service

**Files:** Create `src/services/cycles.ts`; Test `src/services/cycles.test.ts`.

**Produces:** `cycleDateFor(playedAt: Date): string`, returns the `YYYY-MM-DD` Madrid date of the 06:00 boundary at or before `playedAt`.

- [ ] **Step 1:** Tests with UTC inputs: `2026-11-14T04:59:00Z` (05:59 Madrid) gives `2026-11-13`; `2026-11-14T05:00:00Z` (06:00) gives `2026-11-14`; summer `2026-07-01T03:59:00Z` gives `2026-06-30` and `...T04:00:00Z` gives `2026-07-01`; DST change days `2026-10-25T04:59:00Z` and `2027-03-28T03:59:00Z` land on the previous date, the next minute on the new one.
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement with `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', ... })`, subtracting 6 hours of Madrid wall-clock before taking the date; no date library.
- [ ] **Step 4:** Run; expected all pass. Commit `feat: cycle boundaries in Madrid time`.

### Task 4: Valuation service

**Files:** Create `src/services/valuation.ts`; Test `src/services/valuation.test.ts`.

**Produces:** `type Color = 'Blanco'|'Azul'|'Verde'|'Rosa'`; `initialValue(p: { color: Color; ratio: number; matchesPlayed: number }): number`; `nextValue(current: number, recentPoints: number, baselinePoints: number): number`.

Plan's calls (the spec leaves the numbers open): base per color Blanco 2,000,000, Azul 1,500,000, Verde 1,000,000, Rosa 700,000. `initialValue = round10k(base * (0.5 + ratio) * min(1, 0.5 + matchesPlayed / 100))`. `nextValue = round10k(current * (1 + clamp((recent - baseline) / max(baseline, 1), -0.10, 0.10)))`.

- [ ] **Step 1:** Tests: Blanco, ratio 0.8, 100 matches gives `2,600,000`; ratio 0.5, 0 matches gives `500,000`; `nextValue(1_000_000, 30, 10)` gives `1,100,000` (clamped); `nextValue(1_000_000, 0, 10)` gives `900,000`; equal recent and baseline gives unchanged.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Run; pass. Commit `feat: valuation service`.

### Task 5: Verify PTG facts and save fixtures

**Files:** Create `tests/fixtures/ptg/ranking-blanco.html`, `results-marron.html`, `match-finished.html`, `docs/ptg-data-notes.md`.

**Produces:** the answers to GAMEPLAY §9, written down.

- [ ] **Step 1:** Through the cmux tab (`cmux browser --surface <PTG App> eval`), `fetch` each page same-origin and save the HTML, then strip nothing. The group id for Marrón is `727cc31f-3be2-4754-a1fb-2ae956bc4fca`, Blanco `7bdccef6-c5aa-235a-fab5-ecebbae72a48`, city Madrid `e98f5188-7beb-2a97-0e79-7b6d55147209`.
- [ ] **Step 2:** In `docs/ptg-data-notes.md` record: does a player link carry a stable id (look for `/perfil/<uuid>` or similar in the HTML) and its exact pattern; how a super tie-break and a walkover appear; whether the year is present on dates; the group ids for Azul, Verde and Rosa (Madrid, male).
- [ ] **Step 3:** Verification: the notes file answers each of the three questions or says "not available" with the fallback key `(group_id, display_name)`. Stop and tell Pablo if no stable id exists.

### Task 6: Parsers

**Files:** Create `src/lib/ptg/parse-results.ts`, `parse-ranking.ts`; Test `src/lib/ptg/parse.test.ts`.

**Interfaces:** Consumes the fixtures and notes from Task 5.
**Produces:**
`type ParsedMatch = { ptgMatchId: string; playedAt: string /* ISO, Europe/Madrid resolved */; club: string; winners: ParsedPlayer[]; losers: ParsedPlayer[]; winnerSets: number[]; loserSets: number[]; walkover: boolean }`;
`type ParsedPlayer = { ptgPlayerId: string; displayName: string }`;
`parseResults(html: string, now: Date): ParsedMatch[]`;
`parseRanking(html: string): { ptgPlayerId: string; displayName: string; matchesPlayed: number; ratio: number }[]`.

- [ ] **Step 1:** Tests against the fixtures: the first match of `results-marron.html` yields 2 winners and 2 losers, sets `[6,3,6]` vs `[4,6,3]` (the "636 / 463" example); "Tú" resolves to the viewer's player (Pepro) via the id, not the string; two players named "Mario" in different fixtures keep different `ptgPlayerId`; `parseRanking` of Blanco returns Barri with 54 matches and ratio 0.80.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement with `node-html-parser`; dates have no year, so infer it from `now` (a date later than `now` belongs to the previous year). **Step 4:** Run; pass. Commit `feat: PTG results and ranking parsers`.

### Task 7: Schema, RLS and `create_manager`

**Files:** Create `supabase/migrations/0001_core.sql`; Test `supabase/tests/core.sql`.

**Produces tables:** `players(id uuid pk, ptg_player_id text unique, display_name, color text, group_id text, matches_played int, ratio numeric, value int)`, `ptg_matches(id, ptg_match_id text unique, played_at timestamptz, club text, walkover bool)`, `match_players(match_id, player_id, won bool, sets_won int, sets_lost int, points int, primary key(match_id, player_id))`, `profiles(user_id pk references auth.users, team_name, budget int default 5000000, is_admin bool)`, `squads(player_id pk, user_id)`, `lineups(user_id, player_id, primary key(user_id, player_id))`, `market_listings(id, player_id, seller_id null, closes_at, status)`, `bids(id, listing_id, user_id, amount int, created_at)`, `cycles(cycle_date date pk, closed_at)`, `lineup_snapshots(cycle_date, user_id, player_id)`. `squads.player_id` primary key makes ownership exclusive.
**Also:** `create_manager(p_user uuid, p_team text) returns void`: inserts the profile and gives 3 random unowned players per color (12), lineup = the first 2 per color.

- [ ] **Step 1:** Write `supabase/tests/core.sql` asserting: after `create_manager`, the user has 12 squad rows, 8 lineup rows, 2 per color; a second manager never receives an owned player; a user cannot read another user's bids (RLS).
- [ ] **Step 2:** Apply the migration in the Supabase SQL editor (the sandbox blocks raw Postgres; or `supabase db push` from a cmux split). RLS: every table enabled; `players`, `ptg_matches`, `match_players` readable by authenticated users; `bids` and `lineups` readable and writable only by their owner; writes to `squads`, `cycles` and listings only through functions.
- [ ] **Step 3:** Run `core.sql` the same way; expected all assertions pass. Commit `feat: core schema, RLS and create_manager`.

### Task 8: Scraper and ingest

**Files:** Create `scripts/scrape-ptg.sh`, `scripts/ingest.ts`; Test `scripts/ingest.test.ts`.

**Interfaces:** Consumes `parseResults`, `parseRanking`, `initialValue`, `scoreMatch`.
**Produces:** `ingest(parsed: { matches: ParsedMatch[]; ranking: Ranked[]; color: Color }, db: SupabaseClient): Promise<{ matches: number; players: number }>` and an npm script `ingest`.

- [ ] **Step 1:** Test `ingest` against a fake client or a test schema: running it twice leaves identical row counts; a walkover stores 0 points; `players.value` set once from `initialValue` and not overwritten on re-run.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement idempotent upserts keyed on `ptg_match_id` and `ptg_player_id`. `scrape-ptg.sh` loops the four group ids, fetches ranking and results through the cmux tab and writes JSON under `tmp/scrape/` in the main checkout.
- [ ] **Step 4:** Run tests; pass. Run the scraper for real; expected a player count and match count per color printed, and a second run printing the same totals. Commit `feat: PTG scraper and idempotent ingest`.

### Task 9: `close_cycle()` and the market

**Files:** Modify `supabase/migrations/` (add `0002_market.sql`); Test `supabase/tests/close_cycle.sql`.

**Produces:** `place_bid(p_listing uuid, p_amount int) returns void` (rejects an amount above available budget); `list_player(p_player uuid) returns void` (sell to market at current value, immediately); `close_cycle(p_force boolean default false) returns date`, plus `cron.schedule` at `0 4 * * *` and `0 5 * * *` (UTC). Needs the `pg_cron` extension enabled.

- [ ] **Step 1:** SQL assertions: highest bid wins; equal bids go to the earlier `created_at`; a winner whose budget dropped below the bid is skipped and the next bidder wins; budgets never go negative; calling `close_cycle()` outside 06:00 Madrid without `p_force` changes nothing; calling it twice the same day acts once; lineup snapshots exist afterwards for every manager.
- [ ] **Step 2:** Run, expected FAIL. **Step 3:** Implement `close_cycle` as one transaction with `FOR UPDATE` on the listing and the profiles it touches; refuse unless `p_force` or Madrid local hour is 6; insert `cycles` first so a second call hits the primary key and returns.
- [ ] **Step 4:** Run; all assertions pass. Commit `feat: market resolution as a SQL function`.

### Task 10: Pages

**Files:** Create `src/app/(game)/layout.tsx`, `equipo/page.tsx`, `mercado/page.tsx`, `clasificacion/page.tsx`, `admin/page.tsx`, `src/app/onboarding/page.tsx`; Modify `src/app/page.tsx` (redirect to `/equipo`).

**Interfaces:** Consumes the tables and RPCs above, `scoreMatch`, `cycleDateFor`.

- [ ] **Step 1:** Onboarding asks for the team name and calls `create_manager`; the proxy sends users without a profile there.
- [ ] **Step 2:** Equipo: squad by color, lineup toggles (2 per color enforced server-side), points per player for the current cycle. Mercado: listings with value, countdown to 06:00, bid form, and the user's active bids. Clasificación: totals and the current week, computed from `match_players` joined to `lineup_snapshots`. Admin (only `is_admin`): "Cerrar mercado ahora" calling `close_cycle(true)`.
- [ ] **Step 3:** Use `/frontend-design` for the look, reuse Betcomm's green and parchment tokens; run `npx tsc --noEmit` and `npx next build`; expected exit 0.
- [ ] **Step 4:** Manual: sign in with a real Google account, create a team, bid on a listing, press the admin button, see the player move to Equipo. Commit `feat: Equipo, Mercado, Clasificación and admin pages`.

### Task 11: Deploy

- [ ] **Step 1:** Create the Vercel project in team `betcomm` from this repo (needs a GitHub remote, which Pablo creates), set the env vars from `.env.sample`, add domain `ptg-fantasy.betcomm.app`.
- [ ] **Step 2:** Verify: `https://ptg-fantasy.betcomm.app/login` returns 200, and a Google sign-in lands on `/equipo`. Check `select * from cron.job` lists both `close_cycle` entries.
- [ ] **Step 3:** Record the dev diary entry for the day.

---

## Self-Review notes

- Spec coverage: sign-in (done earlier), scoring, cycles, valuation, scraper, market, pages, deploy, dev diary: each has a task. Colors beyond Rosa and automatic scraping are non-goals and have none.
- Open risk carried into Task 5: no stable player id would change Task 6 and 8 keys; the plan stops there and asks.
