import { parseHtml, text } from "@/lib/ptg/dom";
import { UUID, type RankedPlayer } from "@/lib/ptg/types";

const PROFILE_HREF = new RegExp(`^/perfil/(${UUID})$`);

const MATCHES_PLAYED = /^(\d+)(?:\s?\/\s?\d+)?$/; // "156", or "1/15" for a player under the 15-match minimum
const DOCUMENT_POSITION_FOLLOWING = 4;

/**
 * PTG renders a row in two layouts (spans or divs), and unranked players have no rank, so nothing
 * here depends on position. Name: the second span of the first <p> (short and full spelling; keep
 * the full one). Matches played: the first number standing alone after that name block. Win ratio:
 * the span reading "NN%".
 */
function parseRow(row: Element, ptgPlayerId: string): RankedPlayer {
  const nameBlock = row.querySelector("p");
  const displayName = text(nameBlock?.querySelectorAll("span")[1]);
  const looksLikeCount = (e: Element) => MATCHES_PLAYED.test(text(e));
  const matchesCell = Array.from(row.querySelectorAll("*")).find(
    (e) =>
      nameBlock !== null &&
      nameBlock.compareDocumentPosition(e) & DOCUMENT_POSITION_FOLLOWING &&
      looksLikeCount(e) &&
      !Array.from(e.querySelectorAll("*")).some(looksLikeCount), // the innermost element, not its wrappers
  );
  const ratioCell = Array.from(row.querySelectorAll("span")).find((s) => /^\d{1,3}\s?%$/.test(text(s)));

  if (!displayName) throw new Error(`PTG ranking row ${ptgPlayerId}: no player name`);
  if (!matchesCell) throw new Error(`PTG ranking row ${ptgPlayerId}: matches played not found`);
  if (!ratioCell) throw new Error(`PTG ranking row ${ptgPlayerId}: win ratio not found`);
  return {
    ptgPlayerId,
    displayName,
    matchesPlayed: Number(MATCHES_PLAYED.exec(text(matchesCell))?.[1]),
    ratio: Number(text(ratioCell).replace("%", "")) / 100,
  };
}

/**
 * Players of one group's ranking page. The server HTML holds every row twice: a streaming
 * skeleton first (no win ratio, React fills it in later) and the finished row further down.
 * Only the finished copy is read.
 */
export function parseRanking(html: string): RankedPlayer[] {
  const copies = new Map<string, Element[]>();
  for (const row of parseHtml(html).querySelectorAll('a[data-cta-id="ranking_to_player_profile"]')) {
    const id = PROFILE_HREF.exec(row.getAttribute("href") ?? "")?.[1];
    if (id) copies.set(id, [...(copies.get(id) ?? []), row]);
  }
  return [...copies].map(([id, rows]) => {
    const finished = rows.find((r) => text(r).includes("%"));
    if (!finished) {
      throw new Error(`PTG ranking row ${id}: only the streaming skeleton was found, no win ratio (page not fully rendered?)`);
    }
    return parseRow(finished, id);
  });
}
