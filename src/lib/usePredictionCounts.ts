"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type MatchPredictionCounts = {
  team1Votes: number;
  team2Votes: number;
  totalVotes: number;
};

export function usePredictionCounts(matchIds: number[]) {
  const [counts, setCounts] = useState<Map<number, MatchPredictionCounts>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (matchIds.length === 0) {
      setCounts(new Map());
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("predictions")
        .select("match_id,prediction")
        .in("match_id", matchIds)
        .eq("type", "winning_team");

      if (cancelled) return;

      if (!error && data) {
        const map = new Map<number, MatchPredictionCounts>();
        for (const row of data) {
          if (row.match_id === null) continue;
          const existing = map.get(row.match_id) ?? { team1Votes: 0, team2Votes: 0, totalVotes: 0 };
          if (row.prediction === 1) existing.team1Votes += 1;
          else if (row.prediction === 2) existing.team2Votes += 1;
          existing.totalVotes += 1;
          map.set(row.match_id, existing);
        }
        setCounts(map);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIds.join(",")]);

  return { counts, loading };
}
