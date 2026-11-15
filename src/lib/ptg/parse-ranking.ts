import { parseHtml, text } from "@/lib/ptg/dom";
import { UUID, type RankedPlayer } from "@/lib/ptg/types";

export type RankingMeta = {
  /** Selected semester chip, e.g. "1S27". */
  season: string;
  /** PTG tags the running semester "En curso". */
  seasonIsCurrent: boolean;
  gender: "male" | "female";
  level: string;
  groupId: string;
};

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
  const dashCell = Array.from(row.querySelectorAll("span")).find((s) => /^[—–-]\s?%$/.test(text(s)));

  if (!displayName) throw new Error(`PTG ranking row ${ptgPlayerId}: no player name`);
  if (!matchesCell) throw new Error(`PTG ranking row ${ptgPlayerId}: matches played not found`);
  const matchesPlayed = Number(MATCHES_PLAYED.exec(text(matchesCell))?.[1]);
  // A player who has not played yet has no win ratio: PTG prints "—%". Anyone who has played must show a number.
  if (!ratioCell && !(dashCell && matchesPlayed === 0)) throw new Error(`PTG ranking row ${ptgPlayerId}: win ratio not found`);
  return {
    ptgPlayerId,
    displayName,
    matchesPlayed,
    ratio: ratioCell ? Number(text(ratioCell).replace("%", "")) / 100 : 0,
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

const RESULTS_GROUP = new RegExp(`^/ranking/resultados\\?.*grupo=(${UUID})`);

/** The chip a filter group (period, gender, level) shows as selected: PTG paints it with `bg-court`. */
function selectedChip(doc: Document, filter: "period" | "gender" | "level"): Element | undefined {
  return Array.from(doc.querySelectorAll(`button[data-cta-id="ranking_all_scope_${filter}"]`)).find((b) => b.classList.contains("bg-court"));
}

/**
 * What a ranking page says about itself: which semester, gender and level it shows and the id of its group.
 * The scraper checks it so a page for the wrong semester (or one PTG silently redirected) is never ingested.
 */
export function parseRankingMeta(html: string): RankingMeta {
  const doc = parseHtml(html);
  const period = selectedChip(doc, "period");
  const gender = text(selectedChip(doc, "gender"));
  const level = text(selectedChip(doc, "level"));
  const season = /^\d[SH]\d{2}/.exec(text(period))?.[0];
  if (!period || !season) throw new Error("PTG ranking page: no selected semester chip (page layout changed?)");
  if (gender !== "Masculino" && gender !== "Femenino") throw new Error(`PTG ranking page: unknown gender chip "${gender}"`);
  if (!level) throw new Error("PTG ranking page: no selected level chip");
  const groupId = Array.from(doc.querySelectorAll("a[href]"))
    .map((a) => RESULTS_GROUP.exec(a.getAttribute("href") ?? "")?.[1])
    .find(Boolean);
  if (!groupId) throw new Error("PTG ranking page: no results link, so no group id");
  return { season, seasonIsCurrent: text(period).includes("En curso"), gender: gender === "Masculino" ? "male" : "female", level, groupId };
}
