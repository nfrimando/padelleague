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
  event_id: number | null;
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

export function getEventsFromMatches<T extends MatchSeasonRow>(matches: T[]) {
  return Array.from(
    new Set(
      matches
        .map((match) => match.event_id)
        .filter((eventId): eventId is number => eventId !== null)
        .map((eventId) => Number(eventId))
        .filter((eventId) => !Number.isNaN(eventId)),
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

export function filterMatchesByEventAndType(
  matches: MatchWithTeams[],
  eventFilter: number | typeof ALL_MATCH_FILTER,
  selectedTypeFilter: string,
) {
  return matches.filter((match) => {
    if (eventFilter !== ALL_MATCH_FILTER && match.event_id !== eventFilter) {
      return false;
    }

    return matchPassesTypeFilter(match.type, selectedTypeFilter);
  });
}