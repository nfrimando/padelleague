import { MatchSet, MatchWithTeams, Player } from "@/lib/types";

export type MatchRow = Omit<MatchWithTeams, "teams" | "sets">;

export type MatchTeamRow = {
  uuid: string;
  match_id: number;
  team_number: number | null;
  sets_won: number | null;
  player_1: Player | null;
  player_2: Player | null;
};

export type MatchRatingRow = {
  match_id: number;
  player_id: string | number | null;
  rating_pre: number | null;
  formula_name: string | null;
};

type RatingEntry = {
  rating: number;
  formula: string;
  priority: number;
};

export const normalizeId = (value: string | number | null | undefined) =>
  String(value ?? "");

export function groupByMatchId<T extends { match_id: number | string | null }>(
  rows: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = normalizeId(row.match_id);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  return grouped;
}

export function buildPreMatchRatingLookup(
  ratings: MatchRatingRow[],
): Map<string, RatingEntry> {
  const lookup = new Map<string, RatingEntry>();

  for (const row of ratings) {
    const matchId = Number(row.match_id);
    const rating = Number(row.rating_pre);
    const normalizedPlayerId = normalizeId(row.player_id);

    if (!Number.isFinite(matchId) || !Number.isFinite(rating) || !normalizedPlayerId) {
      continue;
    }

    const formula = String(row.formula_name || "").toLowerCase();
    const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
    const key = `${normalizeId(matchId)}:${normalizedPlayerId}`;
    const existing = lookup.get(key);

    if (!existing || priority >= existing.priority) {
      lookup.set(key, { rating, formula, priority });
    }
  }

  return lookup;
}

export function attachPreMatchRating(
  matchId: string | number,
  player: Player | null,
  ratingLookup: Map<string, RatingEntry>,
): Player | null {
  if (!player) {
    return null;
  }

  const key = `${normalizeId(matchId)}:${normalizeId(player.player_id)}`;
  const ratingEntry = ratingLookup.get(key);

  if (!ratingEntry) {
    return player;
  }

  return {
    ...player,
    pre_match_rating: ratingEntry.rating,
    pre_match_rating_formula: ratingEntry.formula,
  };
}

export function assembleMatchesWithTeamsAndSets(params: {
  matches: MatchRow[];
  teamsByMatchId: Map<string, MatchTeamRow[]>;
  setsByMatchId: Map<string, MatchSet[]>;
  ratingLookup: Map<string, RatingEntry>;
}): MatchWithTeams[] {
  const { matches, teamsByMatchId, setsByMatchId, ratingLookup } = params;

  return matches.map((match) => {
    const matchKey = normalizeId(match.match_id);
    const teamsForMatch = teamsByMatchId.get(matchKey) || [];
    const setsForMatch = setsByMatchId.get(matchKey) || [];

    return {
      ...match,
      teams: teamsForMatch.map((team) => ({
        uuid: team.uuid,
        team_number: team.team_number,
        sets_won: team.sets_won,
        player_1: attachPreMatchRating(match.match_id, team.player_1, ratingLookup),
        player_2: attachPreMatchRating(match.match_id, team.player_2, ratingLookup),
      })),
      sets: setsForMatch,
    };
  });
}
