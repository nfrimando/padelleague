"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MatchCard from "@/components/MatchCard";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import PlayerCard from "@/components/PlayerCard";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import {
  ALL_MATCH_FILTER,
  filterMatchesBySeasonAndType,
  getSeasonsFromMatches,
  isValidMatchTypeFilter,
  MATCH_TYPE_FILTER_OPTIONS,
} from "@/lib/matches";
import { usePlayerMatches } from "@/lib/usePlayerMatches";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
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
  const [seasonFilter, setSeasonFilter] = useState<
    number | typeof ALL_MATCH_FILTER
  >(ALL_MATCH_FILTER);
  const [selectedTypeFilter, setSelectedTypeFilter] =
    useState<string>(ALL_MATCH_FILTER);
  const { players, loading } = usePlayers({ onlyActivePlayers: true });
  const filtered = usePlayerSearch(players, search);
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
    const parsedSeason = seasonParam ? Number(seasonParam) : Number.NaN;

    const nextSeason: number | typeof ALL_MATCH_FILTER =
      seasonParam === ALL_MATCH_FILTER
        ? ALL_MATCH_FILTER
        : !Number.isNaN(parsedSeason)
          ? parsedSeason
          : ALL_MATCH_FILTER;

    const typeParam = params.get("type");
    const nextType = isValidMatchTypeFilter(typeParam)
      ? (typeParam as string)
      : ALL_MATCH_FILTER;

    setSeasonFilter((current) =>
      current === nextSeason ? current : nextSeason,
    );
    setSelectedTypeFilter((current) =>
      current === nextType ? current : nextType,
    );
  }, [searchParamsString]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    params.set("season", String(seasonFilter));
    params.set("type", selectedTypeFilter);

    const nextQuery = params.toString();
    if (nextQuery === searchParamsString) {
      return;
    }

    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParamsString, seasonFilter, selectedTypeFilter]);

  const seasonOptions = useMemo(() => {
    return getSeasonsFromMatches(playerMatches);
  }, [playerMatches]);

  const filteredMatches = useMemo(() => {
    return filterMatchesBySeasonAndType(
      playerMatches,
      seasonFilter,
      selectedTypeFilter,
    );
  }, [playerMatches, seasonFilter, selectedTypeFilter]);

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
                  <PlayerCard key={player.player_id} player={player} />
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

            const seasons = playerMatches
              .map((m) => m.season_id)
              .filter((s): s is number => s !== null)
              .map((s) => Number(s))
              .filter((s) => !Number.isNaN(s));

            const firstSeason =
              seasons.length > 0 ? Math.min(...seasons) : null;
            const lastSeason = seasons.length > 0 ? Math.max(...seasons) : null;

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
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="text-center">
                        <div className="text-lg font-bold text-sky-700 dark:text-sky-200">
                          {matchCount}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Matches
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">
                          {winCount}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Wins
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-sky-700 dark:text-sky-200">
                          {matchCount - winCount}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Losses
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-sky-700 dark:text-sky-200">
                          {Math.round((winCount / matchCount) * 100)}%
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Win Rate
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-sky-700 dark:text-sky-200">
                          {firstSeason ?? "N/A"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          First Season
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-sky-700 dark:text-sky-200">
                          {lastSeason ?? "N/A"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Last Season
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
                seasonFilter={seasonFilter}
                seasons={seasonOptions}
                selectedTypeFilter={selectedTypeFilter}
                typeFilterOptions={MATCH_TYPE_FILTER_OPTIONS}
                onSeasonChange={(value) => setSeasonFilter(value)}
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
