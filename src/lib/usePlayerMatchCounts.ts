"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type UsePlayerMatchCountsResult = {
  matchCountCompleted: Record<string, number>;
  latestMatchDates: Record<string, string | null>;
  latestRatings: Record<string, number | null>;
  loading: boolean;
};

type PlayerSummaryRow = {
  player_id: number | string;
  match_count_all: number | string | null;
  match_count_scheduled: number | string | null;
  match_count_completed: number | string | null;
  match_count_cancelled: number | string | null;
  match_count_forfeit: number | string | null;
  latest_match_date: string | null;
  latest_rating: number | string | null;
  latest_rating_formula: string | null;
};

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

  // Use a primitive string key so the effect stays stable when the same IDs
  // arrive with a new array reference (e.g. on every search-box keystroke).
  const stableKey = playerIds.map(String).filter(Boolean).sort().join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const normalizedIds = useMemo(() => {
    return Array.from(new Set(playerIds.map((id) => String(id)).filter(Boolean)));
  }, [stableKey]);

  useEffect(() => {
    if (normalizedIds.length === 0) {
      setMatchCountCompleted({});
      setLatestMatchDates({});
      setLatestRatings({});
      setLoading(false);
      return;
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

      const { data, error } = await supabase.rpc("get_player_summary", {
        p_ids: numericIds,
      });

      if (isCancelled) {
        return;
      }

      if (!error) {
        ((data || []) as PlayerSummaryRow[]).forEach((row) => {
          const playerId = String(row.player_id);
          if (!(playerId in counts)) {
            return;
          }

          const matchCount = Number(row.match_count_completed);
          counts[playerId] = Number.isFinite(matchCount) ? matchCount : 0;

          latestDates[playerId] = row.latest_match_date || null;

          const rawRating = row.latest_rating;
          const rating = rawRating !== null && rawRating !== undefined ? Number(rawRating) : null;
          latestRatingValues[playerId] = rating !== null && Number.isFinite(rating) ? rating : null;
        });
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
