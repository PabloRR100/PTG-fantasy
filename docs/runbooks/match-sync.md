# Match sync: bring the league's results into the game

Points reach the standings **by themselves**: the view `manager_cycle_points` joins each team's 06:00 lineup snapshot with
the results in `match_players` that fall in the same cycle. There is no weekly total to compute or add up. The only
step is to import the matches, and it can run on any day: a result imported late still scores for the snapshot of the day
it was played. A match played before the first snapshot of a manager's lineup never scores. A daily run keeps the table
current; a weekly one is enough for the final numbers.

## One run

`PTG_SURFACE=surface:N scripts/daily-sync.sh` does steps 2-4 below in one go and stops at the first problem (a logged-out tab
fails in the scrape, before anything is written). The numbered steps are what it runs.

1. Open the league's site in a cmux browser tab and log in (credentials are never stored by the project).
   Find its surface: `cmux list-pane-surfaces --pane <pane>`.
2. Save results and matches (only the game's levels, men and women): `PTG_SURFACE=surface:N MATCHES_ONLY=1 scripts/scrape-ptg.sh tmp/scrape-matches`
3. Look before writing: `npm run ingest -- tmp/scrape-matches --matches-only` (prints how many matches are finished and the date range).
4. Write: `npm run ingest -- tmp/scrape-matches --matches-only --apply` (needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`).

The import is idempotent: a match imported twice stays one match with one row per player. Players the game does not hold are
skipped and counted. `--matches-only` never touches players or colors; refreshing colors is a separate, deliberate run
(`scripts/scrape-ptg.sh` without `MATCHES_ONLY`, then `npm run ingest` as a dry run first).

## As a scheduled task in Claude Code

The scrape needs a logged-in browser tab, so a scheduled task only works while that tab is open on the machine that runs it.
Prompt to give the task (daily at 09:00 Madrid is a good time: after the 06:00 close, before players check the table):

> Run the match sync from docs/runbooks/match-sync.md in the PTG-fantasy repo: scrape with MATCHES_ONLY=1 using the open
> logged-in tab, run the ingest as a dry run, and only if it reports finished matches and no errors run it again with
> --apply. Report the counts. If the tab is logged out or any step fails, stop and say which one. Do not touch players or colors.

## Closed-jornada notifications

`npm run ingest -- --apply` ends by calling `announce_closed_jornadas()`. The first import after a Monday-to-Sunday week
has ended (so, the Monday run) queues one `jornada_closed` notification per team (push + Buzón); a week is announced once,
older unannounced weeks are only marked. It runs from the import, not from `close_cycle`, because at 06:00 the weekend's
matches are not in yet. If the Monday import is skipped, the notification waits for the next one.
