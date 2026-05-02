"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type UsePlayerMatchCountsResult = {
  matchCounts: Record<string, number>;
  loading: boolean;
};

type PlayerIdRow = {
  player_1_id?: number | string | null;
  player_2_id?: number | string | null;
};

export function usePlayerMatchCounts(
  playerIds: Array<number | string>,
): UsePlayerMatchCountsResult {
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const normalizedIds = useMemo(() => {
    return Array.from(new Set(playerIds.map((id) => String(id)).filter(Boolean)));
  }, [playerIds]);

  useEffect(() => {
    if (normalizedIds.length === 0) {
      setMatchCounts({});
      setLoading(false);
      return;
    }

    let isCancelled = false;

    async function fetchMatchCounts() {
      setLoading(true);

      const [playerOneResult, playerTwoResult] = await Promise.all([
        supabase
          .from("match_teams")
          .select("player_1_id")
          .in("player_1_id", normalizedIds),
        supabase
          .from("match_teams")
          .select("player_2_id")
          .in("player_2_id", normalizedIds),
      ]);

      if (isCancelled) {
        return;
      }

      const counts: Record<string, number> = {};
      normalizedIds.forEach((id) => {
        counts[id] = 0;
      });

      if (!playerOneResult.error) {
        ((playerOneResult.data || []) as PlayerIdRow[]).forEach((row) => {
          const id = row.player_1_id != null ? String(row.player_1_id) : null;
          if (id && id in counts) {
            counts[id] += 1;
          }
        });
      }

      if (!playerTwoResult.error) {
        ((playerTwoResult.data || []) as PlayerIdRow[]).forEach((row) => {
          const id = row.player_2_id != null ? String(row.player_2_id) : null;
          if (id && id in counts) {
            counts[id] += 1;
          }
        });
      }

      setMatchCounts(counts);
      setLoading(false);
    }

    fetchMatchCounts();

    return () => {
      isCancelled = true;
    };
  }, [normalizedIds]);

  return {
    matchCounts,
    loading,
  };
}
