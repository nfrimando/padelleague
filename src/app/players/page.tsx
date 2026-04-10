"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import MatchCard from "@/components/MatchCard";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import PlayerCard from "@/components/PlayerCard";
import { Player, MatchWithTeams } from "@/lib/types";

const ALL_FILTER = "ALL";
const TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "ALL" },
  { value: "SEASON", label: "SEASON" },
  { value: "DUEL_KOTC", label: "DUEL/KOTC" },
] as const;

function PlayersPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerMatches, setPlayerMatches] = useState<MatchWithTeams[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<number | "ALL">(ALL_FILTER);
  const [selectedTypeFilter, setSelectedTypeFilter] =
    useState<string>(ALL_FILTER);
  const [loadingMatches, setLoadingMatches] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const seasonParam = params.get("season");
    const parsedSeason = seasonParam ? Number(seasonParam) : Number.NaN;

    const nextSeason: number | "ALL" =
      seasonParam === ALL_FILTER
        ? ALL_FILTER
        : !Number.isNaN(parsedSeason)
          ? parsedSeason
          : ALL_FILTER;

    const typeParam = params.get("type");
    const nextType = TYPE_FILTER_OPTIONS.some(
      (option) => option.value === typeParam,
    )
      ? (typeParam as string)
      : ALL_FILTER;

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
    return Array.from(
      new Set(
        playerMatches
          .map((match) => match.season)
          .filter((season): season is number => season !== null)
          .map((season) => Number(season))
          .filter((season) => !Number.isNaN(season)),
      ),
    ).sort((a, b) => b - a);
  }, [playerMatches]);

  const filteredMatches = useMemo(() => {
    return playerMatches.filter((match) => {
      if (seasonFilter !== ALL_FILTER && match.season !== seasonFilter) {
        return false;
      }

      if (selectedTypeFilter === "ALL") {
        return true;
      }

      const matchType = String(match.type || "").toLowerCase();

      if (selectedTypeFilter === "SEASON") {
        return ["group", "semis", "finals"].includes(matchType);
      }

      if (selectedTypeFilter === "DUEL_KOTC") {
        return ["duel", "kotc"].includes(matchType);
      }

      return true;
    });
  }, [playerMatches, seasonFilter, selectedTypeFilter]);

  const updatePlayerParam = (playerId: string | number | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (playerId) {
      params.set("playerId", String(playerId));
    } else {
      params.delete("playerId");
      params.delete("playerid");
    }

    const nextUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  // Fetch players on load
  useEffect(() => {
    async function fetchPlayers() {
      const { data, error } = await supabase.from("players").select("*");

      if (error) {
        console.error(error);
        return;
      }

      setPlayers(data || []);
    }

    fetchPlayers();
  }, []);

  // Filter players when typing
  useEffect(() => {
    if (!search) {
      setFiltered([]);
      return;
    }

    const results = players.filter((p) => {
      const query = search.toLowerCase();

      return (
        p.name?.toLowerCase().includes(query) ||
        p.nickname?.toLowerCase().includes(query)
      );
    });

    setFiltered(results);
  }, [search, players]);

  // Auto-select player from URL query param
  useEffect(() => {
    const playerIdParam =
      searchParams.get("playerId") || searchParams.get("playerid");
    if (!playerIdParam || players.length === 0) {
      return;
    }

    const matchedPlayer = players.find(
      (p) => String(p.player_id) === String(playerIdParam),
    );
    if (!matchedPlayer) {
      return;
    }

    setSelectedPlayer((current) =>
      current?.player_id === matchedPlayer.player_id ? current : matchedPlayer,
    );
    setSearch(matchedPlayer.name || "");
    setFiltered([]);
  }, [players, searchParams]);

  // Fetch matches for selected player
  useEffect(() => {
    if (!selectedPlayer) {
      setPlayerMatches([]);
      return;
    }

    async function fetchPlayerMatches() {
      setLoadingMatches(true);

      try {
        // Get all match_teams where the player is involved
        const { data: teamsData, error: teamsError } = await supabase
          .from("match_teams")
          .select("match_id")
          .or(
            `player_1_id.eq.${selectedPlayer!.player_id},player_2_id.eq.${selectedPlayer!.player_id}`,
          );

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
          setPlayerMatches([]);
          return;
        }

        if (!teamsData || teamsData.length === 0) {
          setPlayerMatches([]);
          return;
        }

        const matchIds = teamsData.map((t) => t.match_id);

        // Get matches
        const { data: matchesData, error: matchesError } = await supabase
          .from("matches")
          .select("*")
          .in("match_id", matchIds)
          .order("date_local", { ascending: false, nullsFirst: false })
          .order("time_local", { ascending: false });

        if (matchesError) {
          console.error("Error fetching matches:", matchesError);
          setPlayerMatches([]);
          return;
        }

        // Get all teams for these matches
        const { data: allTeamsData, error: allTeamsError } = await supabase
          .from("match_teams")
          .select(
            "*, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
          )
          .in("match_id", matchIds);

        if (allTeamsError) {
          console.error("Error fetching teams:", allTeamsError);
          setPlayerMatches([]);
          return;
        }

        // Combine matches with teams
        const matches: MatchWithTeams[] = (matchesData || []).map((m) => ({
          ...m,
          teams: (allTeamsData || [])
            .filter((t) => t.match_id === m.match_id)
            .map((t) => ({
              uuid: t.uuid,
              team_number: t.team_number,
              sets_won: t.sets_won,
              player_1: t.player_1 || null,
              player_2: t.player_2 || null,
            })),
        }));

        setPlayerMatches(matches);
      } catch (error) {
        console.error("Error fetching player matches:", error);
        setPlayerMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    }

    fetchPlayerMatches();
  }, [selectedPlayer]);

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Player Search</h1>

        <div className="relative">
          {/* Input */}
          <input
            type="text"
            placeholder="Type player name..."
            className="w-full border px-3 py-2 rounded"
            value={search}
            onChange={(e) => {
              const nextValue = e.target.value;
              setSearch(nextValue);

              // Keep current selection mounted while typing to avoid layout shifts.
              if (!nextValue.trim()) {
                setSelectedPlayer(null);
                updatePlayerParam(null);
              }
            }}
          />

          {/* Dropdown */}
          {filtered.length > 0 && search.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 z-50 border rounded shadow bg-white dark:bg-slate-900">
              {filtered.slice(0, 5).map((player) => (
                <div
                  key={player.player_id}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-700 bg-gray-800 text-white"
                  onClick={() => {
                    setSelectedPlayer(player);
                    setSearch(player.name);
                    setFiltered([]);
                    updatePlayerParam(player.player_id);
                  }}
                >
                  <div>
                    <div className="font-medium">{player.name}</div>
                    {player.nickname && (
                      <div className="text-sm text-gray-500">
                        {player.nickname}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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

            const seasons = filteredMatches
              .map((m) => m.season)
              .filter((s): s is number => s !== null)
              .map((s) => Number(s))
              .filter((s) => !Number.isNaN(s));

            const firstSeason =
              seasons.length > 0 ? Math.min(...seasons) : null;
            const lastSeason = seasons.length > 0 ? Math.max(...seasons) : null;

            return (
              <div className="mt-6 border p-4 rounded">
                <PlayerCard player={selectedPlayer} size="lg" />
                {!loadingMatches && matchCount > 0 && (
                  <div className="mt-4 pt-3 border-t space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="text-center">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
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
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {matchCount - winCount}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Losses
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {Math.round((winCount / matchCount) * 100)}%
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Win Rate
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {firstSeason ?? "N/A"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          First Season
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {lastSeason ?? "N/A"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Last Season
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-2">
                        Most Played Partners
                      </div>
                      {topPartners.length === 0 ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          No partner data available.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {topPartners.map((partner) => (
                            <div
                              key={`${partner.player_id || partner.name}-${partner.nickname || ""}`}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs"
                            >
                              {partner.player_id ? (
                                <Link
                                  href={`/players?playerId=${encodeURIComponent(partner.player_id)}`}
                                  className="text-slate-700 dark:text-slate-200 hover:underline"
                                >
                                  {partner.name}
                                </Link>
                              ) : (
                                <span className="text-slate-700 dark:text-slate-200">
                                  {partner.name}
                                </span>
                              )}
                              <span className="text-slate-500 dark:text-slate-400">
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
                typeFilterOptions={TYPE_FILTER_OPTIONS}
                onSeasonChange={(value) => setSeasonFilter(value)}
                onTypeChange={(value) => setSelectedTypeFilter(value)}
              />
            </div>
          </div>
          <div className="relative min-h-[220px]">
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
