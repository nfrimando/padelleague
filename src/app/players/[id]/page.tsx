"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
  useParams,
} from "next/navigation";
import BackToHome from "@/components/BackToHome";
import MatchCard from "@/components/MatchCard";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import PlayerCard from "@/components/PlayerCard";
import {
  ALL_MATCH_FILTER,
  filterMatchesByEventAndType,
  getEventsFromMatches,
  isValidMatchTypeFilter,
  MATCH_TYPE_FILTER_OPTIONS,
} from "@/lib/matches";
import { useEventMap } from "@/lib/useEventMap";
import { usePlayerMatches } from "@/lib/usePlayerMatches";
import { usePlayers } from "@/lib/usePlayers";

function PlayerProfilePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeParams = useParams<{ id: string }>();
  const searchParamsString = searchParams.toString();
  const selectedPlayerId = String(routeParams?.id || "");

  const [eventFilter, setEventFilter] = useState<
    number | typeof ALL_MATCH_FILTER
  >(ALL_MATCH_FILTER);
  const [selectedTypeFilter, setSelectedTypeFilter] =
    useState<string>(ALL_MATCH_FILTER);

  const { players, loading: loadingPlayers } = usePlayers({
    onlyActivePlayers: true,
  });
  const selectedPlayer = useMemo(() => {
    return (
      players.find((player) => String(player.player_id) === selectedPlayerId) ??
      null
    );
  }, [players, selectedPlayerId]);

  const {
    matches: playerMatches,
    latestRating: selectedPlayerLatestRating,
    ratingHistory: playerRatingHistory,
    loading: loadingMatches,
  } = usePlayerMatches(selectedPlayerId || null);
  const { eventMap } = useEventMap();

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const seasonParam = params.get("season");
    const parsedEvent = seasonParam ? Number(seasonParam) : Number.NaN;

    const nextEvent: number | typeof ALL_MATCH_FILTER =
      seasonParam === ALL_MATCH_FILTER
        ? ALL_MATCH_FILTER
        : !Number.isNaN(parsedEvent)
          ? parsedEvent
          : ALL_MATCH_FILTER;

    const typeParam = params.get("type");
    const nextType = isValidMatchTypeFilter(typeParam)
      ? (typeParam as string)
      : ALL_MATCH_FILTER;

    setEventFilter((current) => (current === nextEvent ? current : nextEvent));
    setSelectedTypeFilter((current) =>
      current === nextType ? current : nextType,
    );
  }, [searchParamsString]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    params.set("season", String(eventFilter));
    params.set("type", selectedTypeFilter);

    const nextQuery = params.toString();
    if (nextQuery === searchParamsString) {
      return;
    }

    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParamsString, eventFilter, selectedTypeFilter]);

  const eventOptions = useMemo(() => {
    return getEventsFromMatches(playerMatches).map((id) => ({
      id,
      label: eventMap[id] ?? `Event ${id}`,
    }));
  }, [playerMatches, eventMap]);

  const filteredMatches = useMemo(() => {
    return filterMatchesByEventAndType(
      playerMatches,
      eventFilter,
      selectedTypeFilter,
    );
  }, [playerMatches, eventFilter, selectedTypeFilter]);

  const selectedPlayerLatestMatchDate = useMemo(() => {
    const latest = playerMatches.find(
      (match) => typeof match.date_local === "string" && match.date_local,
    );
    return latest?.date_local || null;
  }, [playerMatches]);

  const getPlayerProfileHref = (playerId: string | number) => {
    const params = new URLSearchParams(searchParamsString);
    const nextQuery = params.toString();
    if (!nextQuery) {
      return `/players/${encodeURIComponent(String(playerId))}`;
    }
    return `/players/${encodeURIComponent(String(playerId))}?${nextQuery}`;
  };

  if (loadingPlayers && !selectedPlayer) {
    return (
      <>
        <BackToHome />
        <div className="p-6 max-w-xl mx-auto text-sm text-slate-500">
          Loading player...
        </div>
      </>
    );
  }

  if (!selectedPlayer) {
    return (
      <>
        <BackToHome />
        <div className="p-6 max-w-xl mx-auto">
          <h1 className="text-xl font-semibold mb-2">Player not found</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            This player does not exist or is not currently active.
          </p>
          <Link
            href="/players"
            className="text-sm text-sky-700 dark:text-sky-300 hover:underline"
          >
            Back to players
          </Link>
        </div>
      </>
    );
  }

  const matchCount = filteredMatches.length;
  const winCount = filteredMatches.filter((m) => {
    const playerTeam = m.teams.find(
      (t) =>
        String(t.player_1?.player_id) === selectedPlayerId ||
        String(t.player_2?.player_id) === selectedPlayerId,
    );
    return playerTeam && m.winner_team === playerTeam.team_number;
  }).length;

  const partnerCountMap = new Map<
    string,
    {
      player_id?: string;
      name: string;
      nickname?: string;
      count: number;
    }
  >();

  filteredMatches.forEach((m) => {
    const playerTeam = m.teams.find(
      (t) =>
        String(t.player_1?.player_id) === selectedPlayerId ||
        String(t.player_2?.player_id) === selectedPlayerId,
    );

    if (!playerTeam) {
      return;
    }

    const partner =
      String(playerTeam.player_1?.player_id) === selectedPlayerId
        ? playerTeam.player_2
        : playerTeam.player_1;

    if (!partner) {
      return;
    }

    const partnerKey = partner.player_id
      ? String(partner.player_id)
      : partner.name;
    const current = partnerCountMap.get(partnerKey);

    if (current) {
      current.count += 1;
    } else {
      partnerCountMap.set(partnerKey, {
        player_id: partner.player_id ? String(partner.player_id) : undefined,
        name: partner.name || "Unknown",
        nickname: partner.nickname || undefined,
        count: 1,
      });
    }
  });

  const topPartners = Array.from(partnerCountMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const normalizeEventId = (value: unknown): number | null => {
    if (typeof value === "number") {
      return Number.isInteger(value) && value > 0 ? value : null;
    }
    if (typeof value === "bigint") {
      const normalized = Number(value);
      return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  };

  const mostRecentEventFromMatch = playerMatches
    .map((match) => {
      const normalizedEventId = normalizeEventId(match.event_id);
      if (normalizedEventId === null) {
        return null;
      }

      const datePart =
        typeof match.date_local === "string" ? match.date_local.trim() : "";
      const timePart =
        typeof match.time_local === "string" ? match.time_local.trim() : "";

      let recencyValue = Number.NEGATIVE_INFINITY;
      if (datePart) {
        const withTime = Date.parse(`${datePart}T${timePart || "00:00:00"}`);
        const dateOnly = Date.parse(datePart);

        recencyValue = Number.isFinite(withTime)
          ? withTime
          : Number.isFinite(dateOnly)
            ? dateOnly
            : Number.NEGATIVE_INFINITY;
      }

      return {
        normalizedEventId,
        recencyValue,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        normalizedEventId: number;
        recencyValue: number;
      } => entry !== null,
    )
    .sort((a, b) => {
      if (a.recencyValue !== b.recencyValue) {
        return b.recencyValue - a.recencyValue;
      }

      return b.normalizedEventId - a.normalizedEventId;
    })[0];

  const mostRecentEventLabel = mostRecentEventFromMatch
    ? (eventMap[mostRecentEventFromMatch.normalizedEventId] ??
      `Event ${mostRecentEventFromMatch.normalizedEventId}`)
    : null;

  return (
    <>
      <BackToHome />
      <div
        className="p-6 mx-auto"
        style={{ minWidth: "30vw", maxWidth: "32rem", width: "100%" }}
      >
        <div className="mt-6 border p-4 rounded">
          <PlayerCard
            player={{
              ...selectedPlayer,
              latest_rating: loadingMatches
                ? undefined
                : (selectedPlayerLatestRating ??
                  selectedPlayer.initial_rating ??
                  null),
              latest_match_date: selectedPlayerLatestMatchDate,
            }}
            size="lg"
            disableLink
            ratingHistory={playerRatingHistory}
            loadingRating={loadingMatches}
          />
          {!loadingMatches && matchCount > 0 && (
            <div className="mt-4 pt-3 border-t space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="h-20 min-w-0 text-center flex flex-col justify-center">
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-200 leading-tight">
                    {matchCount}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Matches
                  </div>
                </div>
                <div className="h-20 min-w-0 text-center flex flex-col justify-center">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400 leading-tight">
                    {winCount}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Wins
                  </div>
                </div>
                <div className="h-20 min-w-0 text-center flex flex-col justify-center">
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-200 leading-tight">
                    {matchCount - winCount}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Losses
                  </div>
                </div>
                <div className="h-20 min-w-0 text-center flex flex-col justify-center">
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-200 leading-tight">
                    {Math.round((winCount / matchCount) * 100)}%
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Win Rate
                  </div>
                </div>
                <div className="h-20 min-w-0 text-center flex flex-col justify-center">
                  <div
                    className="text-sm sm:text-base font-bold text-sky-700 dark:text-sky-200 leading-tight whitespace-normal break-words"
                    title={mostRecentEventLabel ?? "N/A"}
                  >
                    {mostRecentEventLabel ?? "N/A"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Most Recent Event
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-white mb-2">
                  Most Played Partners
                </div>
                {topPartners.length === 0 ? (
                  <div className="text-xs text-slate-600 dark:text-slate-200">
                    No partner data available.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topPartners.map((partner) => (
                      <div
                        key={`${partner.player_id || partner.name}-${partner.nickname || ""}`}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800/60"
                      >
                        {partner.player_id ? (
                          <Link
                            href={getPlayerProfileHref(partner.player_id)}
                            className="text-slate-800 dark:text-white hover:underline"
                          >
                            {partner.name}
                          </Link>
                        ) : (
                          <span className="text-slate-800 dark:text-white">
                            {partner.name}
                          </span>
                        )}
                        <span className="text-slate-600 dark:text-slate-200">
                          {partner.count}x
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="max-w-xl mx-auto px-6 mb-4">
          <h2 className="text-xl font-bold">Matches</h2>
          <div className="mt-3">
            <MatchFiltersCard
              eventFilter={eventFilter}
              events={eventOptions}
              selectedTypeFilter={selectedTypeFilter}
              typeFilterOptions={MATCH_TYPE_FILTER_OPTIONS}
              onEventChange={(value) => setEventFilter(value)}
              onTypeChange={(value) => setSelectedTypeFilter(value)}
            />
          </div>
        </div>
        <div className="relative min-h-[220px] w-full lg:max-w-[75vw] mx-auto px-6">
          {loadingMatches && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-[1px]">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Loading matches...
              </div>
            </div>
          )}

          {filteredMatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No matches found for this player with the selected filters.
            </div>
          ) : (
            <div className={`space-y-6 ${loadingMatches ? "opacity-70" : ""}`}>
              {filteredMatches.map((match) => (
                <MatchCard
                  key={match.match_id}
                  match={match}
                  highlightPlayerId={selectedPlayer.player_id}
                  seasonLabel={
                    match.event_id != null
                      ? (eventMap[match.event_id] ?? undefined)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function PlayerProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-xl mx-auto text-sm text-slate-500">
          Loading player...
        </div>
      }
    >
      <PlayerProfilePageContent />
    </Suspense>
  );
}
