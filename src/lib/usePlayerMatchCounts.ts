"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type UsePlayerMatchCountsResult = {
  matchCountCompleted: Record<string, number>;
  latestMatchDates: Record<string, string | null>;
  latestRatings: Record<string, number | null>;
  loading: boolean;
};

type PlayerInitialRatingRow = {
  player_id: number | string | null;
  initial_rating: number | string | null;
};

type MatchPlayerRatingRow = {
  player_id: number | string | null;
  match_id: number | string | null;
  rating_post: number | string | null;
  formula_name: string | null;
};

type MatchMetaRow = {
  match_id: number | string | null;
  date_local: string | null;
  time_local: string | null;
  status: string | null;
};

type LatestRatingCandidate = {
  rating: number;
  dateLocal: string | null;
  timeLocal: string | null;
  matchId: number;
  priority: number;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableStringDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

function compareMatchRecencyDesc(
  candidate: { dateLocal: string | null; timeLocal: string | null; matchId: number },
  existing: { dateLocal: string | null; timeLocal: string | null; matchId: number },
): number {
  const byDate = compareNullableStringDesc(candidate.dateLocal, existing.dateLocal);
  if (byDate !== 0) return byDate;

  const byTime = compareNullableStringDesc(candidate.timeLocal, existing.timeLocal);
  if (byTime !== 0) return byTime;

  return existing.matchId - candidate.matchId;
}

function formulaPriority(formulaName: unknown): number {
  const formula = String(formulaName || "").toLowerCase();
  return formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
}

export function usePlayerMatchCounts(
  playerIds: Array<number | string>,
): UsePlayerMatchCountsResult {
  const [matchCountCompleted, setMatchCountCompleted] = useState<Record<string, number>>({});
  const [latestMatchDates, setLatestMatchDates] = useState<
    Record<string, string | null>
  >({});
  const [latestRatings, setLatestRatings] = useState<
    Record<string, number | null>
  >({});
  const [loading, setLoading] = useState(false);

  const normalizedIds = useMemo(() => {
    return Array.from(new Set(playerIds.map((id) => String(id)).filter(Boolean)));
  }, [playerIds]);

  useEffect(() => {
    if (normalizedIds.length === 0) {
      const resetTimer = setTimeout(() => {
        setMatchCountCompleted({});
        setLatestMatchDates({});
        setLatestRatings({});
        setLoading(false);
      }, 0);

      return () => {
        clearTimeout(resetTimer);
      };
    }

    let isCancelled = false;

    async function fetchMatchCounts() {
      setLoading(true);
      const numericIds = normalizedIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (numericIds.length === 0) {
        if (!isCancelled) {
          setMatchCountCompleted({});
          setLatestMatchDates({});
          setLatestRatings({});
          setLoading(false);
        }
        return;
      }

      const counts: Record<string, number> = {};
      const latestDates: Record<string, string | null> = {};
      const latestRatingValues: Record<string, number | null> = {};

      normalizedIds.forEach((id) => {
        counts[id] = 0;
        latestDates[id] = null;
        latestRatingValues[id] = null;
      });

      const [playersResult, ratingsResult] = await Promise.all([
        supabase
          .from("players")
          .select("player_id, initial_rating")
          .in("player_id", numericIds),
        supabase
          .from("match_player_ratings")
          .select("player_id, match_id, rating_post, formula_name")
          .in("player_id", numericIds),
      ]);

      if (isCancelled) return;

      const initialRatingByPlayer = new Map<string, number | null>();
      if (!playersResult.error) {
        for (const row of (playersResult.data ?? []) as PlayerInitialRatingRow[]) {
          const playerId = toFiniteNumber(row.player_id);
          if (playerId === null) continue;
          initialRatingByPlayer.set(
            String(playerId),
            toFiniteNumber(row.initial_rating),
          );
        }
      }

      const ratingRows = ratingsResult.error
        ? []
        : ((ratingsResult.data ?? []) as MatchPlayerRatingRow[]);

      const matchIds = Array.from(
        new Set(
          ratingRows
            .map((row) => toFiniteNumber(row.match_id))
            .filter((id): id is number => id !== null),
        ),
      );

      const completedMatchesById = new Map<number, MatchMetaRow>();
      if (matchIds.length > 0) {
        const { data: matchRows, error: matchesError } = await supabase
          .from("matches")
          .select("match_id, date_local, time_local, status")
          .in("match_id", matchIds)
          .eq("status", "completed");

        if (isCancelled) return;

        if (!matchesError) {
          for (const row of (matchRows ?? []) as MatchMetaRow[]) {
            const matchId = toFiniteNumber(row.match_id);
            if (matchId === null) continue;
            completedMatchesById.set(matchId, row);
          }
        }
      }

      const completedMatchIdsByPlayer = new Map<string, Set<number>>();
      const latestCandidateByPlayer = new Map<string, LatestRatingCandidate>();

      for (const row of ratingRows) {
        const playerId = toFiniteNumber(row.player_id);
        const matchId = toFiniteNumber(row.match_id);
        const ratingPost = toFiniteNumber(row.rating_post);

        if (playerId === null || matchId === null || ratingPost === null) {
          continue;
        }

        const playerKey = String(playerId);
        if (!(playerKey in counts)) {
          continue;
        }

        const completedMatch = completedMatchesById.get(matchId);
        if (!completedMatch) {
          continue;
        }

        const completedSet =
          completedMatchIdsByPlayer.get(playerKey) ?? new Set<number>();
        completedSet.add(matchId);
        completedMatchIdsByPlayer.set(playerKey, completedSet);

        const candidate: LatestRatingCandidate = {
          rating: ratingPost,
          dateLocal: completedMatch.date_local ?? null,
          timeLocal: completedMatch.time_local ?? null,
          matchId,
          priority: formulaPriority(row.formula_name),
        };

        const existing = latestCandidateByPlayer.get(playerKey);
        if (!existing) {
          latestCandidateByPlayer.set(playerKey, candidate);
          continue;
        }

        const recency = compareMatchRecencyDesc(candidate, existing);
        if (recency < 0) {
          latestCandidateByPlayer.set(playerKey, candidate);
          continue;
        }

        if (recency === 0 && candidate.priority > existing.priority) {
          latestCandidateByPlayer.set(playerKey, candidate);
        }
      }

      for (const playerId of normalizedIds) {
        counts[playerId] = completedMatchIdsByPlayer.get(playerId)?.size ?? 0;
        latestDates[playerId] =
          latestCandidateByPlayer.get(playerId)?.dateLocal ?? null;

        const latestRating = latestCandidateByPlayer.get(playerId)?.rating ?? null;
        if (latestRating !== null) {
          latestRatingValues[playerId] = latestRating;
          continue;
        }

        latestRatingValues[playerId] =
          initialRatingByPlayer.get(playerId) ?? null;
      }

      setMatchCountCompleted(counts);
      setLatestMatchDates(latestDates);
      setLatestRatings(latestRatingValues);
      setLoading(false);
    }

    fetchMatchCounts();

    return () => {
      isCancelled = true;
    };
  }, [normalizedIds]);

  return {
    matchCountCompleted,
    latestMatchDates,
    latestRatings,
    loading,
  };
}
