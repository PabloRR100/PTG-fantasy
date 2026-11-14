import { madridToInstant } from "@/lib/madrid-time";
import { parseHtml, text } from "@/lib/ptg/dom";
import { UUID, type ParsedMatch, type ParsedPlayer, type ParsedSet } from "@/lib/ptg/types";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MAX_GAMES_IN_A_SET = 7;
const PROFILE_HREF = new RegExp(`^/perfil/(${UUID})$`);
// "09lun · NOV20:00": day, weekday, month, time, with no separators once tags are stripped.
const KICKOFF = /(\d{1,2})\s*[a-zá]{3}\s*·\s*([A-Za-zé]{3})\s*(\d{1,2}):(\d{2})/;

function parsePlayer(link: Element, matchId: string): ParsedPlayer {
  const ptgPlayerId = PROFILE_HREF.exec(link.getAttribute("href") ?? "")?.[1];
  if (!ptgPlayerId) throw new Error(`PTG match ${matchId}: player link has no profile id`);
  const nameCell = link.children[1]?.children[0];
  if (!nameCell) throw new Error(`PTG match ${matchId}: could not find the player name`);
  const marker = nameCell.querySelector("span");
  const isViewer = /tú/i.test(text(marker));
  const displayName = text(nameCell).replace(text(marker), "").trim();
  return { ptgPlayerId, displayName, isViewer };
}

function parseSets(root: Document, matchId: string): ParsedSet[] {
  const labels = Array.from(root.querySelectorAll("div")).filter((d) => /^Set \d+$/.test(text(d)));
  return labels.map((label) => {
    const [a, , b] = Array.from(label.parentElement?.querySelectorAll("span") ?? []).map((s) => Number(text(s)));
    for (const games of [a, b]) {
      if (!Number.isInteger(games) || games < 0) {
        throw new Error(`PTG match ${matchId}: could not read the score of ${text(label)}`);
      }
      if (games > MAX_GAMES_IN_A_SET) {
        throw new Error(
          `PTG match ${matchId}: ${text(label)} has ${games} games; a super tie-break is not supported yet (see docs/ptg-data-notes.md)`,
        );
      }
    }
    return { a, b };
  });
}

function parseKickoff(headerText: string, matchId: string, now: Date): string {
  const m = KICKOFF.exec(headerText);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
  if (!m || month === 0) throw new Error(`PTG match ${matchId}: could not read the kickoff from "${headerText}"`);
  const at = (year: number) => madridToInstant(year, month, Number(m[1]), Number(m[3]), Number(m[4]));
  // PTG omits the year: a date more than a day in the future must be last year's.
  const thisYear = at(now.getUTCFullYear());
  const dayMs = 24 * 60 * 60 * 1000;
  return (thisYear.getTime() > now.getTime() + dayMs ? at(now.getUTCFullYear() - 1) : thisYear).toISOString();
}

/** Parses `/partidos/<id>`. `now` anchors the year, which the page does not show. */
export function parseMatchPage(html: string, ptgMatchId: string, now: Date): ParsedMatch {
  const root = parseHtml(html);
  const title = root.querySelector("h1");
  if (!title) throw new Error(`PTG match ${ptgMatchId}: no title found, is the session still logged in?`);
  const status = title.querySelector("em");
  const club = text(title).replace(text(status), "").trim();

  const links = Array.from(root.querySelectorAll('a[data-cta-id="match_to_player_profile"]'));
  if (links.length !== 4) {
    throw new Error(`PTG match ${ptgMatchId}: expected 4 players, found ${links.length}`);
  }
  const players = links.map((l) => parsePlayer(l, ptgMatchId));

  const finished = /finalizado/i.test(text(status));
  const sets = parseSets(root, ptgMatchId);
  return {
    ptgMatchId,
    playedAt: parseKickoff(text(title.parentElement ?? title), ptgMatchId, now),
    club,
    finished,
    walkover: finished && sets.length === 0,
    pairA: players.slice(0, 2),
    pairB: players.slice(2, 4),
    sets,
  };
}
