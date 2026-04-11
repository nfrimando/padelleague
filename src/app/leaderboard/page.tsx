"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import PlayerCard from "@/components/PlayerCard";
import {
  ALL_MATCH_FILTER,
  isValidMatchTypeFilter,
  MATCH_TYPE_FILTER_OPTIONS,
} from "@/lib/matches";
import { Player } from "@/lib/types";
import {
  LeaderboardMode,
  RankedLeaderboardRow,
  useLeaderboardData,
} from "@/lib/useLeaderboardData";
import { useMatchSeasons } from "@/lib/useMatchSeasons";

const LEADERBOARD_MODE_OPTIONS = [
  { value: "PERFORMANCE", label: "Performance" },
  { value: "RATING", label: "Rating" },
] as const;

function LeaderboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [seasonFilter, setSeasonFilter] = useState<
    number | typeof ALL_MATCH_FILTER | null
  >(null);
  const [selectedTypeFilter, setSelectedTypeFilter] =
    useState<string>(ALL_MATCH_FILTER);
  const [selectedMode, setSelectedMode] =
    useState<LeaderboardMode>("PERFORMANCE");
  const {
    seasons,
    loading: seasonsLoading,
    error: seasonsError,
  } = useMatchSeasons();
  const {
    rows,
    topPlayersById,
    loading,
    error,
    minMatchesRequired,
    rankedRowsWithTopTies,
  } = useLeaderboardData({
    seasonFilter,
    selectedTypeFilter,
    selectedMode,
    seasonsLoading,
    seasonsError,
  });

  useEffect(() => {
    if (seasons.length === 0) {
      return;
    }

    const params = new URLSearchParams(searchParamsString);
    const seasonParam = params.get("season");
    const parsedSeason = seasonParam ? Number(seasonParam) : Number.NaN;

    let nextSeason: number | typeof ALL_MATCH_FILTER = seasons[0];
    if (seasonParam === ALL_MATCH_FILTER) {
      nextSeason = ALL_MATCH_FILTER;
    } else if (!Number.isNaN(parsedSeason) && seasons.includes(parsedSeason)) {
      nextSeason = parsedSeason;
    }

    const typeParam = params.get("type");
    const nextType = isValidMatchTypeFilter(typeParam)
      ? (typeParam as string)
      : ALL_MATCH_FILTER;

    const modeParam = params.get("mode");
    const nextMode = LEADERBOARD_MODE_OPTIONS.some(
      (option) => option.value === modeParam,
    )
      ? (modeParam as (typeof LEADERBOARD_MODE_OPTIONS)[number]["value"])
      : "PERFORMANCE";

    setSeasonFilter((current) =>
      current === nextSeason ? current : nextSeason,
    );
    setSelectedTypeFilter((current) =>
      current === nextType ? current : nextType,
    );
    setSelectedMode((current) => (current === nextMode ? current : nextMode));
  }, [seasons, searchParamsString]);

  useEffect(() => {
    if (seasonFilter === null) {
      return;
    }

    const params = new URLSearchParams(searchParamsString);
    params.set("season", String(seasonFilter));
    params.set("type", selectedTypeFilter);
    params.set("mode", selectedMode);
    params.delete("formula");

    const nextQuery = params.toString();
    if (nextQuery === searchParamsString) {
      return;
    }

    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [
    pathname,
    router,
    searchParamsString,
    seasonFilter,
    selectedTypeFilter,
    selectedMode,
  ]);

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Leaderboard</h1>
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/60">
          {LEADERBOARD_MODE_OPTIONS.map((option) => {
            const active = selectedMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSelectedMode(option.value);
                  setSelectedTypeFilter(ALL_MATCH_FILTER);
                  if (option.value === "PERFORMANCE") {
                    const latestSeason = seasons[0];
                    setSeasonFilter(
                      latestSeason !== undefined
                        ? latestSeason
                        : ALL_MATCH_FILTER,
                    );
                  } else {
                    setSeasonFilter(ALL_MATCH_FILTER);
                  }
                }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  active
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {selectedMode === "RATING"
            ? "Rating leaderboard: ordered by latest rating. "
            : "Performance leaderboard: ordered by win rate. "}
          Only players with {minMatchesRequired}+ matches or more are included.
        </p>
        <div className="-mb-4">
          <MatchFiltersCard
            seasonFilter={seasonFilter}
            seasons={seasons}
            selectedTypeFilter={selectedTypeFilter}
            typeFilterOptions={MATCH_TYPE_FILTER_OPTIONS}
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
                      {selectedMode !== "RATING" && (
                        <th className="hidden md:table-cell sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 text-right px-4 py-3 shadow-sm">
                          Win Rate
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rankedRowsWithTopTies.map(
                      (row: RankedLeaderboardRow, index) => (
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
                            <div className="flex items-start gap-2">
                              {index < 10 ? (
                                <PlayerCard
                                  player={
                                    topPlayersById.get(row.player_id) || {
                                      player_id: String(row.player_id),
                                      name: row.name,
                                      nickname: "-",
                                      image_link: null,
                                      latest_rating: row.latest_rating,
                                      latest_match_date: row.last_match_date,
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
                                selectedMode === "PERFORMANCE" &&
                                selectedTypeFilter === "SEASON" && (
                                  <span className="mt-1 inline-flex items-center rounded-full bg-amber-500 text-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
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
                                {selectedMode === "RATING"
                                  ? `Rating: ${
                                      row.latest_rating !== null
                                        ? row.latest_rating.toFixed(2)
                                        : "N/A"
                                    }`
                                  : `Win Rate: ${(row.win_rate * 100).toFixed(1)}%`}
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
                          {selectedMode !== "RATING" && (
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
                          )}
                        </tr>
                      ),
                    )}
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
