"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import PlayerCard from "@/components/PlayerCard";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

type LeaderboardRow = {
  player_id: number;
  name: string;
  matches_played: number;
  wins: number;
  sets_won: number;
  sets_lost: number;
  win_rate: number;
  latest_rating: number | null;
};

const ALL_TYPES = "ALL";
const ALL_SEASONS = "ALL";
const MIN_MATCHES = 5;
const MIN_MATCHES_ALL_TYPES = 10;
const MAX_LEADERBOARD_ROWS = 20;
const TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "ALL", includeTypes: null as string[] | null },
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

function LeaderboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [topPlayersById, setTopPlayersById] = useState<Map<number, Player>>(
    new Map(),
  );
  const [seasonFilter, setSeasonFilter] = useState<
    number | typeof ALL_SEASONS | null
  >(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedTypeFilter, setSelectedTypeFilter] =
    useState<string>(ALL_TYPES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFilterOptions() {
      const { data, error: filterError } = await supabase
        .from("matches")
        .select("season,type")
        .not("season", "is", null)
        .order("season", { ascending: true });

      if (filterError || !data) {
        setLoading(false);
        setError(filterError?.message || "Failed to load filters.");
        return;
      }

      const uniqueSeasons = Array.from(
        new Set(
          data
            .map((row) => Number(row.season))
            .filter((season) => !Number.isNaN(season)),
        ),
      );

      if (uniqueSeasons.length > 0) {
        setSeasons(uniqueSeasons);
      }

      if (uniqueSeasons.length === 0) {
        setLoading(false);
      }
    }

    loadFilterOptions();
  }, []);

  useEffect(() => {
    if (seasons.length === 0) {
      return;
    }

    const params = new URLSearchParams(searchParamsString);
    const seasonParam = params.get("season");
    const parsedSeason = seasonParam ? Number(seasonParam) : Number.NaN;

    let nextSeason: number | typeof ALL_SEASONS = seasons[seasons.length - 1];
    if (seasonParam === ALL_SEASONS) {
      nextSeason = ALL_SEASONS;
    } else if (!Number.isNaN(parsedSeason) && seasons.includes(parsedSeason)) {
      nextSeason = parsedSeason;
    }

    const typeParam = params.get("type");
    const nextType = TYPE_FILTER_OPTIONS.some(
      (option) => option.value === typeParam,
    )
      ? (typeParam as string)
      : ALL_TYPES;

    setSeasonFilter((current) =>
      current === nextSeason ? current : nextSeason,
    );
    setSelectedTypeFilter((current) =>
      current === nextType ? current : nextType,
    );
  }, [seasons, searchParamsString]);

  useEffect(() => {
    if (seasonFilter === null) {
      return;
    }

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

  useEffect(() => {
    async function loadLeaderboard() {
      if (seasonFilter === null) {
        return;
      }

      setLoading(true);
      setError(null);

      const selectedFilter = TYPE_FILTER_OPTIONS.find(
        (option) => option.value === selectedTypeFilter,
      );

      const includeTypes = selectedFilter?.includeTypes ?? null;
      const rpcRequests =
        includeTypes === null
          ? [
              supabase.rpc("get_leaderboard", {
                season_filter:
                  seasonFilter === ALL_SEASONS ? null : seasonFilter,
                type_filter: null,
              }),
            ]
          : includeTypes.map((type) =>
              supabase.rpc("get_leaderboard", {
                season_filter:
                  seasonFilter === ALL_SEASONS ? null : seasonFilter,
                type_filter: type,
              }),
            );

      const rpcResults = await Promise.all(rpcRequests);
      const failedResult = rpcResults.find((result) => result.error);

      if (failedResult?.error) {
        setError(failedResult.error.message || "Failed to load leaderboard.");
        setRows([]);
        setLoading(false);
        return;
      }

      const combinedRows = rpcResults.flatMap((result) => result.data || []);
      const aggregatedMap = new Map<number, LeaderboardRow>();
      const minMatchesRequired =
        seasonFilter === ALL_SEASONS ? MIN_MATCHES_ALL_TYPES : MIN_MATCHES;

      combinedRows.forEach((row: any) => {
        const playerId = Number(row.player_id);
        const matchesPlayed = Number(row.matches_played || 0);
        const wins = Number(row.wins || 0);
        const setsWon = Number(row.sets_won || 0);
        const setsLost = Number(row.sets_lost || 0);
        const latestRating =
          row.latest_rating === null || row.latest_rating === undefined
            ? null
            : Number(row.latest_rating);

        const existing = aggregatedMap.get(playerId);
        if (existing) {
          existing.matches_played += matchesPlayed;
          existing.wins += wins;
          existing.sets_won += setsWon;
          existing.sets_lost += setsLost;
          existing.win_rate =
            existing.matches_played > 0
              ? existing.wins / existing.matches_played
              : 0;
          if (
            existing.latest_rating === null &&
            latestRating !== null &&
            Number.isFinite(latestRating)
          ) {
            existing.latest_rating = latestRating;
          }
          return;
        }

        aggregatedMap.set(playerId, {
          player_id: playerId,
          name: row.name || "Unknown",
          matches_played: matchesPlayed,
          wins,
          sets_won: setsWon,
          sets_lost: setsLost,
          win_rate: matchesPlayed > 0 ? wins / matchesPlayed : 0,
          latest_rating:
            latestRating !== null && Number.isFinite(latestRating)
              ? latestRating
              : null,
        });
      });

      const normalized: LeaderboardRow[] = Array.from(
        aggregatedMap.values(),
      ).filter(
        (row: LeaderboardRow) => row.matches_played >= minMatchesRequired,
      );

      normalized.sort((a: LeaderboardRow, b: LeaderboardRow) => {
        if (b.win_rate !== a.win_rate) {
          return b.win_rate - a.win_rate;
        }
        if (b.matches_played !== a.matches_played) {
          return b.matches_played - a.matches_played;
        }
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        if (b.sets_won !== a.sets_won) {
          return b.sets_won - a.sets_won;
        }
        return a.sets_lost - b.sets_lost;
      });

      const topTenIds = normalized
        .slice(0, 10)
        .map((row: LeaderboardRow) => row.player_id);
      if (topTenIds.length > 0) {
        const { data: playersData, error: playersError } = await supabase
          .from("players")
          .select("player_id,name,nickname,image_link")
          .in("player_id", topTenIds);

        if (!playersError && playersData) {
          const map = new Map<number, Player>();
          playersData.forEach((player) => {
            map.set(Number(player.player_id), {
              player_id: String(player.player_id),
              name: player.name || "Unknown",
              nickname: player.nickname || "-",
              image_link: player.image_link || null,
              latest_rating:
                normalized.find(
                  (row) => row.player_id === Number(player.player_id),
                )?.latest_rating ?? null,
            });
          });
          setTopPlayersById(map);
        } else {
          setTopPlayersById(new Map());
        }
      } else {
        setTopPlayersById(new Map());
      }

      setRows(normalized);
      setLoading(false);
    }

    loadLeaderboard();
  }, [seasonFilter, selectedTypeFilter]);

  let previousRow: LeaderboardRow | null = null;
  let currentRank = 0;
  const rankedRows = rows.map((row, index) => {
    if (
      previousRow &&
      row.win_rate === previousRow.win_rate &&
      row.matches_played === previousRow.matches_played &&
      row.wins === previousRow.wins &&
      row.sets_won === previousRow.sets_won &&
      row.sets_lost === previousRow.sets_lost
    ) {
      // Keep the same rank when matches and wins are tied.
    } else {
      currentRank = index + 1;
    }

    previousRow = row;
    return { ...row, rank: currentRank };
  });

  const rankedRowsWithTop20Ties = (() => {
    if (rankedRows.length <= MAX_LEADERBOARD_ROWS) {
      return rankedRows;
    }

    const baseRows = rankedRows.slice(0, MAX_LEADERBOARD_ROWS);
    const boundary = baseRows[baseRows.length - 1];
    const extraTies = rankedRows.slice(MAX_LEADERBOARD_ROWS).filter((row) => {
      return (
        row.win_rate === boundary.win_rate &&
        row.matches_played === boundary.matches_played &&
        row.wins === boundary.wins &&
        row.sets_won === boundary.sets_won &&
        row.sets_lost === boundary.sets_lost
      );
    });

    return [...baseRows, ...extraTies];
  })();

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Leaderboard</h1>
        <p className="text-sm text-slate-500 mb-4">
          Only players with{" "}
          {seasonFilter === ALL_SEASONS ? MIN_MATCHES_ALL_TYPES : MIN_MATCHES}+
          matches or more are included.
        </p>
        <div className="-mb-4">
          <MatchFiltersCard
            seasonFilter={seasonFilter}
            seasons={seasons}
            selectedTypeFilter={selectedTypeFilter}
            typeFilterOptions={TYPE_FILTER_OPTIONS}
            onSeasonChange={(value) => setSeasonFilter(value)}
            onTypeChange={(value) => setSelectedTypeFilter(value)}
          />
        </div>
      </div>

      {!loading && error && (
        <div className="px-6 max-w-xl mx-auto text-red-600 dark:text-red-400">
          Error: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="px-6 max-w-xl mx-auto text-slate-600">
          No leaderboard data found.
        </div>
      )}

      {!error && (rows.length > 0 || loading) && (
        <div className="-mt-2">
          <div className="max-w-xl mx-auto px-6 mb-0.5">
            <p className="text-xs text-slate-500">
              Scroll inside the table to view more rankings.
            </p>
          </div>
          <div className="max-w-5xl mx-auto px-6">
            <div className="relative min-h-[320px]">
              {loading && (
                <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-[1px]">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Loading leaderboard...
                  </div>
                </div>
              )}
              <div className="overflow-x-hidden md:overflow-x-auto overflow-y-scroll max-h-[70vh] border rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
                <table
                  className={`w-full text-sm ${loading ? "opacity-70" : ""}`}
                >
                  <thead>
                    <tr>
                      <th className="sticky top-0 md:left-0 z-50 w-[72px] min-w-[72px] bg-slate-100 dark:bg-slate-800 text-left px-4 py-3 shadow-sm">
                        Rank
                      </th>
                      <th className="sticky top-0 md:left-[72px] z-50 min-w-[190px] md:min-w-[220px] bg-slate-100 dark:bg-slate-800 text-left px-4 py-3 shadow-sm">
                        Player
                      </th>
                      <th className="hidden md:table-cell sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 text-right px-4 py-3 shadow-sm">
                        Matches
                      </th>
                      <th className="hidden md:table-cell sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 text-right px-4 py-3 shadow-sm">
                        Wins
                      </th>
                      <th className="hidden md:table-cell sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 text-right px-4 py-3 shadow-sm">
                        Sets Won
                      </th>
                      <th className="hidden md:table-cell sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 text-right px-4 py-3 shadow-sm">
                        Sets Lost
                      </th>
                      <th className="hidden md:table-cell sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 text-right px-4 py-3 shadow-sm">
                        Win Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedRowsWithTop20Ties.map((row, index) => (
                      <tr
                        key={row.player_id}
                        className={`border-t border-slate-200 dark:border-slate-700 ${
                          row.rank === 1
                            ? "bg-amber-50 dark:bg-amber-900/20"
                            : ""
                        }`}
                      >
                        <td
                          className={`md:sticky md:left-0 z-30 w-[72px] min-w-[72px] px-4 py-3 font-semibold md:shadow-[2px_0_0_0_rgba(0,0,0,0.06)] ${
                            row.rank === 1
                              ? "bg-amber-50 dark:bg-amber-900/20"
                              : "bg-white dark:bg-slate-900"
                          }`}
                        >
                          #{row.rank}
                        </td>
                        <td
                          className={`md:sticky md:left-[72px] z-30 min-w-[190px] md:min-w-[220px] px-4 py-3 md:shadow-[2px_0_0_0_rgba(0,0,0,0.06)] ${
                            row.rank === 1
                              ? "bg-amber-50 dark:bg-amber-900/20"
                              : "bg-white dark:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {index < 10 ? (
                              <PlayerCard
                                player={
                                  topPlayersById.get(row.player_id) || {
                                    player_id: String(row.player_id),
                                    name: row.name,
                                    nickname: "-",
                                    image_link: null,
                                    latest_rating: row.latest_rating,
                                  }
                                }
                              />
                            ) : (
                              <Link
                                href={`/players?playerId=${encodeURIComponent(String(row.player_id))}`}
                                className="group inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 decoration-transparent underline-offset-2 transition-colors duration-150 hover:text-sky-700 dark:hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 rounded"
                              >
                                {row.name}
                                <span className="text-sky-600/80 dark:text-sky-300/80 opacity-0 translate-x-[-2px] transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
                                  {"->"}
                                </span>
                              </Link>
                            )}
                            {row.rank === 1 &&
                              selectedTypeFilter === "SEASON" && (
                                <span className="inline-flex items-center rounded-full bg-amber-500 text-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                                  MVP
                                </span>
                              )}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300 md:hidden">
                            <div>Matches: {row.matches_played}</div>
                            <div>Wins: {row.wins}</div>
                            <div>Sets Won: {row.sets_won}</div>
                            <div>Sets Lost: {row.sets_lost}</div>
                            <div className="col-span-2 font-medium">
                              Win Rate: {(row.win_rate * 100).toFixed(1)}%
                            </div>
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-right">
                          {index < 10 ? (
                            <div className="inline-flex items-center justify-end">
                              <span className="text-base font-semibold bg-gradient-to-r from-slate-700 to-slate-500 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                                {row.matches_played}
                              </span>
                            </div>
                          ) : (
                            row.matches_played
                          )}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-right">
                          {index < 10 ? (
                            <div className="inline-flex items-center justify-end">
                              <span className="text-base font-semibold bg-gradient-to-r from-emerald-600 to-lime-500 dark:from-emerald-400 dark:to-lime-300 bg-clip-text text-transparent">
                                {row.wins}
                              </span>
                            </div>
                          ) : (
                            row.wins
                          )}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-right">
                          {index < 10 ? (
                            <div className="inline-flex items-center justify-end">
                              <span className="text-base font-semibold bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-300 bg-clip-text text-transparent">
                                {row.sets_won}
                              </span>
                            </div>
                          ) : (
                            row.sets_won
                          )}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-right">
                          {index < 10 ? (
                            <div className="inline-flex items-center justify-end">
                              <span className="text-base font-semibold bg-gradient-to-r from-rose-600 to-orange-500 dark:from-rose-400 dark:to-orange-300 bg-clip-text text-transparent">
                                {row.sets_lost}
                              </span>
                            </div>
                          ) : (
                            row.sets_lost
                          )}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-right font-medium">
                          {index < 10 ? (
                            <div className="inline-flex items-center justify-end">
                              <span className="text-base font-semibold bg-gradient-to-r from-amber-500 to-yellow-400 dark:from-amber-300 dark:to-yellow-200 bg-clip-text text-transparent">
                                {(row.win_rate * 100).toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            `${(row.win_rate * 100).toFixed(1)}%`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-xl mx-auto text-sm text-slate-500">
          Loading leaderboard...
        </div>
      }
    >
      <LeaderboardPageContent />
    </Suspense>
  );
}
