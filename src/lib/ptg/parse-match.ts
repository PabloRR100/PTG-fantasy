import { madridToInstant } from "@/lib/madrid-time";
import { parseHtml, text } from "@/lib/ptg/dom";
import { UUID, type ParsedMatch, type ParsedPlayer, type ParsedSet } from "@/lib/ptg/types";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MAX_GAMES_IN_A_SET = 7;
const PROFILE_HREF = new RegExp(`^/perfil/(${UUID})$`);
// "09lun · NOV20:00": day, weekday, month, time, with no separators once tags are stripped.
const KICKOFF = /(\d{1,2})\s*\p{L}{3}\s*·\s*(\p{L}{3})\s*(\d{1,2}):(\d{2})/u;

const VIEWER_MARKER = /^·\s*tú$/i;

/** The cell holding the player's name, or undefined while PTG still shows its streaming skeleton. */
const nameCellOf = (link: Element) => link.children[1]?.children[0];

function parsePlayer(link: Element, ptgPlayerId: string, matchId: string): ParsedPlayer {
  const nameCell = nameCellOf(link);
  if (!nameCell) throw new Error(`PTG match ${matchId}: could not find the player name`);
  const isViewer = Array.from(nameCell.querySelectorAll("span")).some((s) => VIEWER_MARKER.test(text(s)));
  // Only the cell's own text is the name: the spans beside it hold "·tú" or a champion title.
  const displayName = Array.from(nameCell.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return { ptgPlayerId, displayName, isViewer };
}

/**
 * The four players in page order. The server HTML renders each card twice: a streaming skeleton
 * (no name yet) and the real card, so they are merged by profile id and the named copy is read.
 */
function parsePlayers(root: Document, matchId: string): ParsedPlayer[] {
  const copies = new Map<string, Element[]>();
  for (const link of Array.from(root.querySelectorAll('a[data-cta-id="match_to_player_profile"]'))) {
    const id = PROFILE_HREF.exec(link.getAttribute("href") ?? "")?.[1];
    if (!id) throw new Error(`PTG match ${matchId}: player link has no profile id`);
    copies.set(id, [...(copies.get(id) ?? []), link]);
  }
  if (copies.size !== 4) throw new Error(`PTG match ${matchId}: expected 4 players, found ${copies.size}`);
  return Array.from(copies, ([id, links]) => {
    const named = links.find((l) => nameCellOf(l));
    if (!named) throw new Error(`PTG match ${matchId}: player ${id} only has its streaming skeleton (page not fully rendered?)`);
    return parsePlayer(named, id, matchId);
  });
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

  const players = parsePlayers(root, ptgMatchId);

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
