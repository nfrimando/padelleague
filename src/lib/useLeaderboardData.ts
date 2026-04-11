"use client";

import { useEffect, useMemo, useState } from "react";
import { getIncludedMatchTypes, ALL_MATCH_FILTER } from "@/lib/matches";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

export type LeaderboardRow = {
  player_id: string;
  name: string;
  matches_played: number;
  wins: number;
  sets_won: number;
  sets_lost: number;
  win_rate: number;
  latest_rating: number | null;
  last_match_id: number | null;
  last_match_date: string | null;
};

export type RankedLeaderboardRow = LeaderboardRow & {
  rank: number;
};

export type LeaderboardMode = "PERFORMANCE" | "RATING";

type UseLeaderboardDataArgs = {
  seasonFilter: number | typeof ALL_MATCH_FILTER | null;
  selectedTypeFilter: string;
  selectedMode: LeaderboardMode;
  seasonsLoading: boolean;
  seasonsError: string | null;
  maxRows?: number;
  minMatches?: number;
  minMatchesAllTypes?: number;
};

const DEFAULT_MAX_ROWS = 20;
const DEFAULT_MIN_MATCHES = 5;
const DEFAULT_MIN_MATCHES_ALL_TYPES = 10;

export function useLeaderboardData({
  seasonFilter,
  selectedTypeFilter,
  selectedMode,
  seasonsLoading,
  seasonsError,
  maxRows = DEFAULT_MAX_ROWS,
  minMatches = DEFAULT_MIN_MATCHES,
  minMatchesAllTypes = DEFAULT_MIN_MATCHES_ALL_TYPES,
}: UseLeaderboardDataArgs) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [topPlayersById, setTopPlayersById] = useState<Map<string, Player>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const minMatchesRequired =
    seasonFilter === ALL_MATCH_FILTER ? minMatchesAllTypes : minMatches;

  useEffect(() => {
    if (seasonsError) {
      setError(seasonsError);
      setLoading(false);
      return;
    }
  }, [seasonsError]);

  useEffect(() => {
    async function loadLeaderboard() {
      if (seasonFilter === null || seasonsLoading || seasonsError) {
        return;
      }

      setLoading(true);
      setError(null);

      const includeTypes = getIncludedMatchTypes(selectedTypeFilter);
      const rpcName =
        selectedMode === "RATING"
          ? "get_leaderboard_ratings"
          : "get_leaderboard";

      const buildRpcArgs = (typeFilter: string | null) => {
        if (selectedMode === "RATING") {
          return {
            season_filter:
              seasonFilter === ALL_MATCH_FILTER ? null : seasonFilter,
            type_filter: typeFilter,
            formula_filter: null,
            min_matches: minMatchesRequired,
          };
        }

        return {
          season_filter:
            seasonFilter === ALL_MATCH_FILTER ? null : seasonFilter,
          type_filter: typeFilter,
        };
      };

      const rpcRequests =
        includeTypes === null
          ? [supabase.rpc(rpcName, buildRpcArgs(null))]
          : includeTypes.map((type) =>
              supabase.rpc(rpcName, buildRpcArgs(type)),
            );

      const rpcResults = await Promise.all(rpcRequests);
      const failedResult = rpcResults.find((result) => result.error);

      if (failedResult?.error) {
        setError(failedResult.error.message || "Failed to load leaderboard.");
        setRows([]);
        setTopPlayersById(new Map());
        setLoading(false);
        return;
      }

      const combinedRows = rpcResults.flatMap((result) => result.data || []);
      const aggregatedMap = new Map<string, LeaderboardRow>();

      const parseDateMs = (value: string | null) => {
        if (!value) {
          return Number.NEGATIVE_INFINITY;
        }

        const timestamp = Date.parse(value);
        return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
      };

      const isRowMoreRecent = (
        incomingDate: string | null,
        incomingMatchId: number | null,
        existingDate: string | null,
        existingMatchId: number | null,
      ) => {
        const incomingDateMs = parseDateMs(incomingDate);
        const existingDateMs = parseDateMs(existingDate);

        if (incomingDateMs !== existingDateMs) {
          return incomingDateMs > existingDateMs;
        }

        return (incomingMatchId ?? -1) > (existingMatchId ?? -1);
      };

      combinedRows.forEach((row: any) => {
        const playerId = String(row.player_id ?? "");
        if (!playerId) {
          return;
        }

        const matchesPlayed = Number(row.matches_played || 0);
        const wins = Number(row.wins || 0);
        const setsWon = Number(row.sets_won || 0);
        const setsLost = Number(row.sets_lost || 0);
        const lastMatchId =
          row.last_match_id === null || row.last_match_id === undefined
            ? null
            : Number(row.last_match_id);
        const lastMatchDate =
          row.last_match_date === null || row.last_match_date === undefined
            ? null
            : String(row.last_match_date);
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

          const incomingIsMoreRecent = isRowMoreRecent(
            lastMatchDate,
            Number.isFinite(lastMatchId ?? NaN) ? lastMatchId : null,
            existing.last_match_date,
            existing.last_match_id,
          );

          if (incomingIsMoreRecent) {
            existing.last_match_id =
              Number.isFinite(lastMatchId ?? NaN) && lastMatchId !== null
                ? lastMatchId
                : existing.last_match_id;
            existing.last_match_date = lastMatchDate;
          }

          if (
            latestRating !== null &&
            Number.isFinite(latestRating) &&
            (existing.latest_rating === null || incomingIsMoreRecent)
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
          last_match_id:
            Number.isFinite(lastMatchId ?? NaN) && lastMatchId !== null
              ? lastMatchId
              : null,
          last_match_date: lastMatchDate,
        });
      });

      const normalized = Array.from(aggregatedMap.values()).filter(
        (row) => row.matches_played >= minMatchesRequired,
      );

      normalized.sort((a, b) => {
        if (selectedMode === "RATING") {
          const ratingA = a.latest_rating ?? Number.NEGATIVE_INFINITY;
          const ratingB = b.latest_rating ?? Number.NEGATIVE_INFINITY;
          if (ratingB !== ratingA) {
            return ratingB - ratingA;
          }
          if (b.matches_played !== a.matches_played) {
            return b.matches_played - a.matches_played;
          }
          if (b.wins !== a.wins) {
            return b.wins - a.wins;
          }
          return a.name.localeCompare(b.name);
        }

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

      const topTenIds = normalized.slice(0, 10).map((row) => row.player_id);
      if (topTenIds.length > 0) {
        const { data: playersData, error: playersError } = await supabase
          .from("players")
          .select("player_id,name,nickname,image_link")
          .in("player_id", topTenIds);

        if (!playersError && playersData) {
          const map = new Map<string, Player>();
          playersData.forEach((player) => {
            const playerId = String(player.player_id);
            map.set(playerId, {
              player_id: playerId,
              name: player.name || "Unknown",
              nickname: player.nickname || "-",
              image_link: player.image_link || null,
              latest_rating:
                normalized.find((row) => row.player_id === playerId)
                  ?.latest_rating ?? null,
              latest_match_date:
                normalized.find((row) => row.player_id === playerId)
                  ?.last_match_date ?? null,
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
  }, [
    minMatchesRequired,
    seasonFilter,
    seasonsError,
    seasonsLoading,
    selectedMode,
    selectedTypeFilter,
  ]);

  const rankedRowsWithTopTies = useMemo(() => {
    let previousRow: LeaderboardRow | null = null;
    let currentRank = 0;

    const rankedRows: RankedLeaderboardRow[] = rows.map((row, index) => {
      const isTie =
        previousRow &&
        (selectedMode === "RATING"
          ? row.latest_rating === previousRow.latest_rating &&
            row.matches_played === previousRow.matches_played &&
            row.wins === previousRow.wins
          : row.win_rate === previousRow.win_rate &&
            row.matches_played === previousRow.matches_played &&
            row.wins === previousRow.wins &&
            row.sets_won === previousRow.sets_won &&
            row.sets_lost === previousRow.sets_lost);

      if (!isTie) {
        currentRank = index + 1;
      }

      previousRow = row;
      return { ...row, rank: currentRank };
    });

    if (rankedRows.length <= maxRows) {
      return rankedRows;
    }

    const baseRows = rankedRows.slice(0, maxRows);
    const boundary = baseRows[baseRows.length - 1];
    const extraTies = rankedRows.slice(maxRows).filter((row) => {
      if (selectedMode === "RATING") {
        return (
          row.latest_rating === boundary.latest_rating &&
          row.matches_played === boundary.matches_played &&
          row.wins === boundary.wins
        );
      }

      return (
        row.win_rate === boundary.win_rate &&
        row.matches_played === boundary.matches_played &&
        row.wins === boundary.wins &&
        row.sets_won === boundary.sets_won &&
        row.sets_lost === boundary.sets_lost
      );
    });

    return [...baseRows, ...extraTies];
  }, [maxRows, rows, selectedMode]);

  return {
    rows,
    topPlayersById,
    loading,
    error,
    minMatchesRequired,
    rankedRowsWithTopTies,
  };
}