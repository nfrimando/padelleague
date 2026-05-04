import { MatchWithTeams } from "@/lib/types";

export const ALL_MATCH_FILTER = "ALL" as const;

export const MATCH_TYPES = ["duel", "finals", "group", "kotc", "semis"] as const;

type MatchSeasonRow = {
  event_id: number | null;
};

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

export function filterMatchesByEventAndType(
  matches: MatchWithTeams[],
  eventFilter: number | typeof ALL_MATCH_FILTER,
  selectedTypeFilter: string,
) {
  const shouldFilterByEventId =
    eventFilter !== ALL_MATCH_FILTER && Number.isFinite(eventFilter);

  return matches.filter((match) => {
    // Treat null event_id as unassigned so it remains visible across seasons.
    if (
      shouldFilterByEventId &&
      match.event_id != null &&
      match.event_id !== eventFilter
    ) {
      return false;
    }
    if (selectedTypeFilter === ALL_MATCH_FILTER) return true;
    return match.type === selectedTypeFilter;
  });
}