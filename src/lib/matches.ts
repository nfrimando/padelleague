import { MatchWithTeams } from "@/lib/types";

export const ALL_MATCH_FILTER = "ALL" as const;

export const MATCH_TYPE_FILTER_OPTIONS = [
  { value: ALL_MATCH_FILTER, label: "ALL", includeTypes: null as string[] | null },
  {
    value: "SEASON",
    label: "SEASON",
    includeTypes: ["group", "semis", "finals"],
  },
  {
    value: "DUEL_KOTC",
    label: "DUEL/KOTC",
    includeTypes: ["duel", "kotc"],
  },
] as const;

export type MatchTypeFilterValue =
  (typeof MATCH_TYPE_FILTER_OPTIONS)[number]["value"];

type MatchSeasonRow = {
  season_id: number | null;
};

export function isValidMatchTypeFilter(value: string | null): boolean {
  return MATCH_TYPE_FILTER_OPTIONS.some((option) => option.value === value);
}

export function getIncludedMatchTypes(
  filterValue: string,
): readonly string[] | null {
  const selected = MATCH_TYPE_FILTER_OPTIONS.find(
    (option) => option.value === filterValue,
  );

  return (selected?.includeTypes as readonly string[] | null) ?? null;
}

export function getSeasonsFromMatches<T extends MatchSeasonRow>(matches: T[]) {
  return Array.from(
    new Set(
      matches
        .map((match) => match.season_id)
        .filter((season): season is number => season !== null)
        .map((season) => Number(season))
        .filter((season) => !Number.isNaN(season)),
    ),
  ).sort((a, b) => b - a);
}

export function matchPassesTypeFilter(
  matchType: string | null,
  selectedTypeFilter: string,
) {
  const includeTypes = getIncludedMatchTypes(selectedTypeFilter);

  if (includeTypes === null) {
    return true;
  }

  return includeTypes.includes(String(matchType || "").toLowerCase());
}

export function filterMatchesBySeasonAndType(
  matches: MatchWithTeams[],
  seasonFilter: number | typeof ALL_MATCH_FILTER,
  selectedTypeFilter: string,
) {
  return matches.filter((match) => {
    if (seasonFilter !== ALL_MATCH_FILTER && match.season_id !== seasonFilter) {
      return false;
    }

    return matchPassesTypeFilter(match.type, selectedTypeFilter);
  });
}