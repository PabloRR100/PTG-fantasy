import { parseRanking, parseRankingMeta } from "@/lib/ptg/parse-ranking";
import { buildPlayersPayload, type PlayerPayload } from "@/services/ingest";
import { resolveLevels, type Gender, type GroupRanking, type ResolvedLevels } from "@/services/levels";

export const GENDERS: readonly Gender[] = ["male", "female"];
/** Every level PTG has, strongest first. All are read, so a player listed in two of them is seen as ambiguous. */
export const LEVELS = ["Blanco", "Azul", "Verde", "Rosa", "Oro", "Granate", "Morado", "Marrón", "Plata", "Naranja"] as const;

export const rankingFileName = (gender: Gender, level: string) => `ranking-${gender}-${level}.html`;

export type PlayersPlan = { season: string; payload: PlayerPayload[]; resolved: ResolvedLevels; presentIds: string[] };

/**
 * Reads the saved ranking pages (one per gender and level) and decides which players the game can load.
 * Refuses a partial or mixed picture: every group present, all of one semester, all of the running one
 * (unless `allowPastSeason`), each file really the group its name says.
 */
export function planPlayers(read: (fileName: string) => string | null, options: { allowPastSeason?: boolean } = {}): PlayersPlan {
  const groups: GroupRanking[] = [];
  const seasons = new Set<string>();
  for (const gender of GENDERS) {
    for (const level of LEVELS) {
      const file = rankingFileName(gender, level);
      const html = read(file);
      if (!html) throw new Error(`${file} is missing or empty. Run scripts/scrape-ptg.sh (every gender and level is needed to tell which level a player is in).`);
      const meta = parseRankingMeta(html);
      if (meta.gender !== gender || meta.level !== level) {
        throw new Error(`${file} holds the ${meta.gender} ${meta.level} ranking, not ${gender} ${level}.`);
      }
      if (!meta.seasonIsCurrent && !options.allowPastSeason) {
        throw new Error(`${file} is for ${meta.season}, which is not the current semester. Re-run the scraper (or pass --allow-past-season).`);
      }
      seasons.add(meta.season);
      groups.push({ gender, level, groupId: meta.groupId, players: parseRanking(html) });
    }
  }
  if (seasons.size > 1) throw new Error(`The saved rankings come from several semesters (${[...seasons].join(", ")}). Scrape again into an empty folder.`);
  const resolved = resolveLevels(groups);
  return { season: [...seasons][0], payload: buildPlayersPayload(resolved.loadable), resolved, presentIds: resolved.presentIds };
}

export type CurrentPlayer = { ptg_player_id: string; color: string; gender: string };
export type ChangeSummary = {
  newPlayers: number;
  colorChanged: number;
  genderChanged: number;
  unchanged: number;
  /** Already in the game but absent from (or ambiguous in) this semester's rankings: left exactly as they are. */
  notInRankings: number;
  colorChanges: { ptgPlayerId: string; from: string; to: string }[];
};

/** What loading `payload` would do to the players already stored, matched by PTG's stable id. */
export function summarizeChanges(current: CurrentPlayer[], payload: Pick<PlayerPayload, "ptg_player_id" | "color" | "gender">[]): ChangeSummary {
  const stored = new Map(current.map((p) => [p.ptg_player_id, p]));
  const incoming = new Set(payload.map((p) => p.ptg_player_id));
  const summary: ChangeSummary = { newPlayers: 0, colorChanged: 0, genderChanged: 0, unchanged: 0, notInRankings: 0, colorChanges: [] };
  for (const p of payload) {
    const was = stored.get(p.ptg_player_id);
    if (!was) summary.newPlayers += 1;
    else if (was.color !== p.color) {
      summary.colorChanged += 1;
      summary.colorChanges.push({ ptgPlayerId: p.ptg_player_id, from: was.color, to: p.color });
    } else if (was.gender !== p.gender) summary.genderChanged += 1;
    else summary.unchanged += 1;
  }
  summary.notInRankings = current.filter((p) => !incoming.has(p.ptg_player_id)).length;
  return summary;
}
