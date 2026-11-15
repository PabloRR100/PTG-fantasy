import type { RankedPlayer } from "@/lib/ptg/types";
import { COLORS, levelOf } from "@/services/lineup";
import type { Color } from "@/services/valuation";

/** The colors the game plays with: all ten levels. */
export const GAME_COLORS: readonly Color[] = COLORS;

export type Gender = "male" | "female";

/** One PTG ranking page: the players of one level and gender for the current semester. */
export type GroupRanking = { gender: Gender; level: string; groupId: string; players: RankedPlayer[] };

export type LoadablePlayer = RankedPlayer & { color: Color; gender: Gender; groupId: string };
export type AmbiguousPlayer = { ptgPlayerId: string; displayName: string; groups: { gender: Gender; level: string }[] };
export type OutOfGamePlayer = { ptgPlayerId: string; displayName: string; level: string; gender: Gender };
export type GroupCount = { gender: Gender; level: string; groupId: string; read: number; loadable: number };

export type ResolvedLevels = {
  loadable: LoadablePlayer[];
  /** In more than one group this semester: the ranking does not say which level he plays, so nothing is guessed. */
  ambiguous: AmbiguousPlayer[];
  /** In exactly one group, of a color the game does not use. */
  outOfGame: OutOfGamePlayer[];
  perGroup: GroupCount[];
  /** Every PTG id that appears in any ranking this semester, ambiguous ones included: who is part of the game at all. */
  presentIds: string[];
};

const isGameColor = (level: string): level is Color => (GAME_COLORS as readonly string[]).includes(level);

/**
 * The official ranking of the current semester is the only source of a player's color. Pass EVERY group
 * that was read (all levels and both genders, not just the game's): a player listed in a game group and in
 * another one must be seen as ambiguous, and he is only visible if the other group was read too.
 */
export function resolveLevels(groups: GroupRanking[]): ResolvedLevels {
  const seen = new Map<string, { player: RankedPlayer; groups: GroupRanking[] }>();
  for (const g of groups) {
    for (const player of g.players) {
      const entry = seen.get(player.ptgPlayerId) ?? { player, groups: [] };
      if (!entry.groups.includes(g)) entry.groups.push(g); // a group that lists him twice is still one group
      seen.set(player.ptgPlayerId, entry);
    }
  }

  const loadable: LoadablePlayer[] = [];
  const ambiguous: AmbiguousPlayer[] = [];
  const outOfGame: OutOfGamePlayer[] = [];
  const loadablePerGroup = new Map<GroupRanking, number>();

  for (const { player, groups: where } of seen.values()) {
    const sameLevel = where.length > 1 && where.every((g) => g.gender === where[0].gender && levelOf(g.level) === levelOf(where[0].level));
    if (sameLevel) {
      // The same level for the game (Azul y Blanco): show the color of the group he has played more in, Blanco on a tie.
      const best = where.reduce((a, b) => {
        const pa = a.players.find((p) => p.ptgPlayerId === player.ptgPlayerId)!.matchesPlayed;
        const pb = b.players.find((p) => p.ptgPlayerId === player.ptgPlayerId)!.matchesPlayed;
        return pb > pa || (pb === pa && COLORS.indexOf(b.level as Color) < COLORS.indexOf(a.level as Color)) ? b : a;
      });
      const row = best.players.find((p) => p.ptgPlayerId === player.ptgPlayerId)!;
      loadable.push({ ...row, color: best.level as Color, gender: best.gender, groupId: best.groupId });
      loadablePerGroup.set(best, (loadablePerGroup.get(best) ?? 0) + 1);
      continue;
    }
    if (where.length > 1) {
      ambiguous.push({
        ptgPlayerId: player.ptgPlayerId,
        displayName: player.displayName,
        groups: where.map((g) => ({ gender: g.gender, level: g.level })),
      });
      continue;
    }
    const [only] = where;
    if (isGameColor(only.level)) {
      loadable.push({ ...player, color: only.level, gender: only.gender, groupId: only.groupId });
      loadablePerGroup.set(only, (loadablePerGroup.get(only) ?? 0) + 1);
    } else {
      outOfGame.push({ ptgPlayerId: player.ptgPlayerId, displayName: player.displayName, level: only.level, gender: only.gender });
    }
  }

  const perGroup = groups.map((g) => ({
    gender: g.gender,
    level: g.level,
    groupId: g.groupId,
    read: new Set(g.players.map((p) => p.ptgPlayerId)).size,
    loadable: loadablePerGroup.get(g) ?? 0,
  }));
  return { loadable, ambiguous, outOfGame, perGroup, presentIds: [...seen.keys()] };
}
