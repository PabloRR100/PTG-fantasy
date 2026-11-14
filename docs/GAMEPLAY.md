# PTG Fantasy: gameplay

> Status: **draft v0 (2026-11-14)**. Every number below is a *proposal* to be tuned, unless a line says **Fact**.
> Facts come from reading the PTG app (Madrid, men's, 1S27). Proposals are the assistant's, for Pablo to correct.

## 1. What this is

A Biwenger-style fantasy for a friends' league. Each manager owns real PTG players, lines them up, and earns points
from the matches those players play in PTG. Managers buy players by bidding in a daily market.

## 2. What PTG gives us (Facts)

| Item | Detail |
|---|---|
| Levels | Colors, strongest to weakest as PTG orders them: Blanco, Azul, Verde, Rosa, Oro, Granate, Morado, Marrón, Plata, Naranja. The pilot uses the first four. |
| Match | Doubles. Two winners, two losers, a score per set (`6-3, 3-6, 6-3`), date and time, club. |
| Per player | Matches played (PJ) and win ratio, per group and per period (semester or all-time). |
| Calendar | None fixed. Each player plays as many matches as they can. |
| Access | Login required. The pilot reads it through the logged-in browser of the league admin. |

## 3. The week has no fixtures, so time is cut by the market (Proposal)

There is no matchday. The game runs on a **daily cycle that closes at 06:00 (Europe/Madrid)**:

1. At 06:00 the market resolves (section 6).
2. At 06:00 a **lineup snapshot** is taken for every manager.
3. Matches played during the next 24 hours score for the players in that snapshot.

So a manager can change the lineup any time, and the change counts from the next 06:00. A match is assigned to a
cycle by its start time. Standings are shown per week (Monday to Sunday) and in total.

## 4. Points per match (Proposal)

A player who plays a match earns:

| Event | Points |
|---|---|
| Played the match | +2 |
| Won the match | +4 |
| Each set won | +1 |
| Each set lost | -1 |

Floor of 0 per match. Both members of a pair earn the same.

| Example | Points |
|---|---|
| Wins 6-3, 6-4 (2 sets won, 0 lost) | 2 + 4 + 2 = **8** |
| Wins 6-3, 3-6, 6-3 (2 won, 1 lost) | 2 + 4 + 2 - 1 = **7** |
| Loses 3-6, 6-3, 4-6 (1 won, 2 lost) | 2 + 0 + 1 - 2 = **1** |
| Loses 3-6, 4-6 (0 won, 2 lost) | 2 - 2 = **0** |

**Playing more earns more.** That is intended: a player with more matches scores more, so the market value (section 7)
rises and they cost more. Volume is priced, not capped.

## 5. Levels: how Blanco and Oro stay comparable (Proposal)

PTG ratios are measured *inside* a color, so a Blanco player winning 55% is not worse than an Oro player winning 70%.
v0 does **not** apply a point multiplier per color. Two things keep it fair:

- **The lineup is balanced by color** (2 per color), so a manager cannot stack the easiest group.
- **Price absorbs the rest.** Value follows points actually scored (section 7).

Open question: if one color dominates the market anyway, add a per-color factor after the first real weeks of data.

## 6. Market (Proposal)

- Every manager starts with a budget and a random squad.
- Each day, a set of free players (owned by nobody) is listed for 24 hours, plus any player a manager puts up for sale.
- A manager places a bid on a listed player, not above their current available budget.
- At 06:00 the highest bid wins. **Tie: the earliest bid wins.** Winning bids are charged then; a winner who cannot pay any longer loses that player to the next bid.
- A manager can sell a player to the market at once for the current market value.

## 7. Market value (Proposal)

- **Initial value** comes from PTG data: a base per color scaled by win ratio and matches played.
- **Daily change** follows form (momentum): points scored in the last 14 days against the player's own average, clamped to
  -10% / +10% per day. This replaces the cross-community trading Biwenger uses; with one league we only have our own bids,
  which can be added as a second signal later.

## 8. Squad and lineup (Proposal)

| Rule | Value |
|---|---|
| Lineup | 2 players per color, 4 colors, so 8 starters |
| Squad | 12 players |
| Starting budget | 5,000,000 |

## 9. Open questions

- Does PTG expose a stable player id (needed to tell two players called "Mario" apart)? The scraper must confirm it.
- Super tie-breaks: is a third set written as a tie-break score or as a normal set? Affects the set count.
- Do walkovers or unplayed matches appear in results? They must score 0 and not count as played.
