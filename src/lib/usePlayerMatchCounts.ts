"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type UsePlayerMatchCountsResult = {
  matchCounts: Record<string, number>;
  latestMatchDates: Record<string, string | null>;
  latestRatings: Record<string, number | null>;
  loading: boolean;
};

type PlayerSummaryRow = {
  player_id: number | string;
  match_count: number | string | null;
  latest_match_date: string | null;
  latest_rating: number | string | null;
  latest_rating_formula: string | null;
};

export function usePlayerMatchCounts(
  playerIds: Array<number | string>,
): UsePlayerMatchCountsResult {
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
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
      setMatchCounts({});
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
          setMatchCounts({});
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

          const matchCount = Number(row.match_count);
          counts[playerId] = Number.isFinite(matchCount) ? matchCount : 0;

          latestDates[playerId] = row.latest_match_date || null;

          const rating = Number(row.latest_rating);
          latestRatingValues[playerId] = Number.isFinite(rating) ? rating : null;
        });
      }

      setMatchCounts(counts);
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
    matchCounts,
    latestMatchDates,
    latestRatings,
    loading,
  };
}
