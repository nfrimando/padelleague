"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MatchCard from "@/components/MatchCard";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import PlayerCard from "@/components/PlayerCard";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import {
  ALL_MATCH_FILTER,
  filterMatchesByEventAndType,
  getEventsFromMatches,
  isValidMatchTypeFilter,
  MATCH_TYPE_FILTER_OPTIONS,
} from "@/lib/matches";
import { usePlayerMatches } from "@/lib/usePlayerMatches";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { useEventMap } from "@/lib/useEventMap";
import { Player } from "@/lib/types";

function PlayersPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isClearingPlayerSelection, setIsClearingPlayerSelection] =
    useState(false);
  const [ignoredPlayerIdAfterClear, setIgnoredPlayerIdAfterClear] = useState<
    string | null
  >(null);
  const [pendingSelectedPlayerId, setPendingSelectedPlayerId] = useState<
    string | null
  >(null);
  const [eventFilter, setEventFilter] = useState<
    number | typeof ALL_MATCH_FILTER
  >(ALL_MATCH_FILTER);
  const [selectedTypeFilter, setSelectedTypeFilter] =
    useState<string>(ALL_MATCH_FILTER);
  const playerCardHrefBuilder = useCallback(
    (playerId: string) => {
      const params = new URLSearchParams(searchParamsString);
      params.set("playerId", playerId);
      params.delete("playerid");
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParamsString],
  );

  const { players, loading } = usePlayers({ onlyActivePlayers: true });
  const filtered = usePlayerSearch(players, search);
  const { eventMap, events } = useEventMap();
  const {
    matches: playerMatches,
    latestRating: selectedPlayerLatestRating,
    ratingHistory: playerRatingHistory,
    loading: loadingMatches,
  } = usePlayerMatches(
    selectedPlayer ? String(selectedPlayer.player_id) : null,
  );

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

  // State for rerolling random players
  const [randomPlayers, setRandomPlayers] = useState<Player[]>([]);

  // Helper to shuffle and pick 8 players
  const pickRandomPlayers = () => {
    if (players.length === 0) return [];
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8);
  };

  // On players load or reroll, pick a new set
  useEffect(() => {
    if (players.length > 0) {
      setRandomPlayers(pickRandomPlayers());
    }
  }, [players]);

  // Handler for reroll button
  const handleReroll = () => {
    setRandomPlayers(pickRandomPlayers());
  };

  const getPlayerProfileHref = (playerId: string | number) => {
    const params = new URLSearchParams(searchParamsString);
    params.set("playerId", String(playerId));
    return `${pathname}?${params.toString()}`;
  };

  const updatePlayerParam = (playerId: string | number | null) => {
    const params = new URLSearchParams(searchParamsString);

    if (playerId) {
      params.set("playerId", String(playerId));
      // Clear legacy player-name query params so URL state stays canonical.
      params.delete("name");
      params.delete("playerName");
      params.delete("playername");
    } else {
      params.delete("playerId");
      params.delete("playerid");
      params.delete("name");
      params.delete("playerName");
      params.delete("playername");
    }

    const nextUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const selectPlayerFromSearch = (player: Player) => {
    setIsClearingPlayerSelection(false);
    setPendingSelectedPlayerId(String(player.player_id));
    setSelectedPlayer(player);
    setSearch(player.name);
    updatePlayerParam(player.player_id);
  };

  // Auto-select player from URL query param
  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const playerIdParam = params.get("playerId") || params.get("playerid");

    if (pendingSelectedPlayerId) {
      if (String(playerIdParam || "") === pendingSelectedPlayerId) {
        setPendingSelectedPlayerId(null);
      } else {
        return;
      }
    }

    if (!playerIdParam && isClearingPlayerSelection) {
      setIsClearingPlayerSelection(false);
      setIgnoredPlayerIdAfterClear(null);
    }

    if (isClearingPlayerSelection) {
      if (!playerIdParam) {
        return;
      }

      if (
        ignoredPlayerIdAfterClear &&
        String(playerIdParam) === ignoredPlayerIdAfterClear
      ) {
        return;
      }

      setIsClearingPlayerSelection(false);
      setIgnoredPlayerIdAfterClear(null);
    }

    if (
      playerIdParam &&
      selectedPlayer &&
      String(selectedPlayer.player_id) !== String(playerIdParam)
    ) {
      // Clear stale profile immediately while switching to another player.
      setSelectedPlayer(null);
    }

    if (!playerIdParam || players.length === 0) {
      return;
    }

    const matchedPlayer = players.find(
      (p) => String(p.player_id) === String(playerIdParam),
    );
    if (!matchedPlayer) {
      setSelectedPlayer(null);
      return;
    }

    setSelectedPlayer((current) =>
      current?.player_id === matchedPlayer.player_id ? current : matchedPlayer,
    );
    setSearch(matchedPlayer.name || "");
  }, [
    players,
    searchParamsString,
    isClearingPlayerSelection,
    pendingSelectedPlayerId,
    ignoredPlayerIdAfterClear,
  ]);

  return (
    <>
      <BackToHome />
      <div
        className="p-6 mx-auto"
        style={{ minWidth: "30vw", maxWidth: "32rem", width: "100%" }}
      >
        <h1 className="text-2xl font-bold mb-4">Player Search</h1>

        <PlayerSearchBox
          value={search}
          suggestions={filtered}
          maxSuggestions={5}
          selectedPlayerName={selectedPlayer?.name || null}
          placeholder="Type player name..."
          onValueChange={(nextValue) => {
            setSearch(nextValue);

            // If search no longer matches selected player, clear the URL param.
            if (
              selectedPlayer &&
              nextValue.trim().toLowerCase() !==
                String(selectedPlayer.name || "")
                  .trim()
                  .toLowerCase()
            ) {
              updatePlayerParam(null);
            }

            // Keep current selection mounted while typing to avoid layout shifts.
            if (!nextValue.trim()) {
              setSelectedPlayer(null);
            }
          }}
          onSelectPlayer={selectPlayerFromSearch}
          onClear={() => {
            setIsClearingPlayerSelection(true);
            setIgnoredPlayerIdAfterClear(
              selectedPlayer ? String(selectedPlayer.player_id) : null,
            );
            setPendingSelectedPlayerId(null);
            setSearch("");
            setSelectedPlayer(null);
            updatePlayerParam(null);
          }}
        />

        {!selectedPlayer && search.trim().length === 0 && (
          <div className="mt-6 border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Explore Players...
              </h2>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-sm hover:bg-sky-100 dark:hover:bg-sky-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition"
                onClick={handleReroll}
                disabled={loading || players.length === 0}
                aria-label="Re-roll players"
              >
                Re-roll
              </button>
            </div>
            {players.length === 0 && loading ? (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="animate-spin h-6 w-6 text-sky-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  ></path>
                </svg>
              </div>
            ) : randomPlayers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {randomPlayers.map((player) => (
                  <PlayerCard
                    key={player.player_id}
                    player={player}
                    hrefBuilder={playerCardHrefBuilder}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Selected Player Details */}
        {selectedPlayer &&
          (() => {
            const matchCount = filteredMatches.length;
            const selectedPlayerId = String(selectedPlayer.player_id);
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
                  player_id: partner.player_id
                    ? String(partner.player_id)
                    : undefined,
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
                return Number.isInteger(normalized) && normalized > 0
                  ? normalized
                  : null;
              }
              if (typeof value === "string") {
                const parsed = Number.parseInt(value, 10);
                return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
              }
              return null;
            };

            const playerEventIds = new Set(
              playerMatches
                .map((m) => normalizeEventId(m.event_id))
                .filter((id): id is number => id !== null),
            );

            const mostRecentEvent = events
              .map((event) => ({
                ...event,
                normalizedEventId: normalizeEventId(event.event_id),
              }))
              .filter(
                (event) =>
                  event.normalizedEventId !== null &&
                  playerEventIds.has(event.normalizedEventId),
              )
              .sort((a, b) => {
                const createdAtA = a.created_at
                  ? new Date(a.created_at).getTime()
                  : Number.NEGATIVE_INFINITY;
                const createdAtB = b.created_at
                  ? new Date(b.created_at).getTime()
                  : Number.NEGATIVE_INFINITY;

                if (createdAtA !== createdAtB) {
                  return createdAtB - createdAtA;
                }

                const nameA = (a.name ?? "").trim();
                const nameB = (b.name ?? "").trim();
                const nameCompare = nameB.localeCompare(nameA, undefined, {
                  sensitivity: "base",
                });
                if (nameCompare !== 0) {
                  return nameCompare;
                }

                return (b.normalizedEventId ?? 0) - (a.normalizedEventId ?? 0);
              })[0];

            const mostRecentEventLabel = mostRecentEvent
              ? mostRecentEvent.name?.trim() ||
                (mostRecentEvent.normalizedEventId
                  ? (eventMap[mostRecentEvent.normalizedEventId] ?? null)
                  : null)
              : null;

            return (
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
                          className="text-sm sm:text-base font-bold text-sky-700 dark:text-sky-200 leading-tight truncate"
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
            );
          })()}
      </div>

      {/* Player Matches - Full Width */}
      {selectedPlayer && (
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
              <div
                className={`space-y-6 ${loadingMatches ? "opacity-70" : ""}`}
              >
                {filteredMatches.map((match) => (
                  <MatchCard
                    key={match.match_id}
                    match={match}
                    highlightPlayerId={selectedPlayer?.player_id}
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
      )}
    </>
  );
}

export default function PlayersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-xl mx-auto text-sm text-slate-500">
          Loading players...
        </div>
      }
    >
      <PlayersPageContent />
    </Suspense>
  );
}
