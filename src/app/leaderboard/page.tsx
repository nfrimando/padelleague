"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BackToHome from "@/components/BackToHome";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import TopPlayersTable, {
  TopPlayersTableRow,
} from "@/components/TopPlayersTable";
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

const PERFORMANCE_DEFAULT_TYPE = "SEASON";

function LeaderboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [seasonFilter, setSeasonFilter] = useState<
    number | typeof ALL_MATCH_FILTER | null
  >(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>(
    PERFORMANCE_DEFAULT_TYPE,
  );
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
    const parsedType = isValidMatchTypeFilter(typeParam)
      ? (typeParam as string)
      : ALL_MATCH_FILTER;

    const modeParam = params.get("mode");
    const nextMode = LEADERBOARD_MODE_OPTIONS.some(
      (option) => option.value === modeParam,
    )
      ? (modeParam as (typeof LEADERBOARD_MODE_OPTIONS)[number]["value"])
      : "PERFORMANCE";

    const nextType =
      nextMode === "PERFORMANCE" && parsedType === ALL_MATCH_FILTER
        ? PERFORMANCE_DEFAULT_TYPE
        : parsedType;

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
                  setSelectedTypeFilter(
                    option.value === "PERFORMANCE"
                      ? PERFORMANCE_DEFAULT_TYPE
                      : ALL_MATCH_FILTER,
                  );
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
          <div className="max-w-5xl mx-auto px-6">
            <TopPlayersTable
              loading={loading}
              rows={rankedRowsWithTopTies.map((row: RankedLeaderboardRow) => {
                const topPlayer = topPlayersById.get(row.player_id) as
                  | Player
                  | undefined;

                const leaderboardRow: TopPlayersTableRow = {
                  player_id: String(row.player_id),
                  name: row.name,
                  nickname: topPlayer?.nickname ?? null,
                  image_link: topPlayer?.image_link ?? null,
                  latest_match_date:
                    row.last_match_date ?? topPlayer?.latest_match_date ?? null,
                  wins: row.wins,
                  sets_won: row.sets_won,
                  sets_lost: row.sets_lost,
                  matches_played: row.matches_played,
                  latest_rating:
                    row.latest_rating ?? topPlayer?.latest_rating ?? null,
                };

                return leaderboardRow;
              })}
              emptyMessage="No leaderboard data found."
            />
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
