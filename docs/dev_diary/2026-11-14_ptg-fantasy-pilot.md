# PTG Fantasy pilot: dev diary

Newest day first.

## 2026-11-14

**What was done.** Started from an empty repo. Read how PTG exposes its league: the app needs a login, and the sandbox
blocks its domain, so data is read through the logged-in cmux browser tab. A group's results page lists every match with
both pairs, set scores, date and club, which is enough to score played, won and sets. The ranking gives matches played and
win ratio per player.

**Decisions.**
- Option 2 for the demo: real PTG data and real writes, with the market close run by a SQL function.
- Login is Google through Supabase Auth, copied from Betcomm. The Google client id and secret go into the Supabase
  dashboard, not into the app.
- The 06:00 close is a Postgres function scheduled with `pg_cron` (Betcomm uses Vercel crons instead), because resolving
  bids moves budgets and ownership and must be one transaction. It fires at 04:00 and 05:00 UTC and acts only at 06:00 Madrid.
- Domain is a subdomain of Betcomm, `ptg-fantasy.betcomm.app`, to avoid paying for a new one.

**What it showed.** Two environment traps cost time and are written down so they are not repeated: the sandbox blocks
`registry.npmjs.org` (run installs in a cmux split), and this machine's npm points at `npm.apple.com`, which Vercel cannot
reach (install with the public registry and check the lockfile). Next 16 does not recognise TypeScript 7; the project
pins 5.

**State.** Auth skeleton builds. `docs/GAMEPLAY.md`, the design and the implementation plan are written and approved.
Nothing is committed yet. Next: the plan's Task 1.
