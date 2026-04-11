"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSeasonsFromMatches } from "@/lib/matches";

type MatchSeasonRow = {
  season_id: number | null;
};

export function useMatchSeasons(enabled = true) {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSeasons([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;

    async function loadSeasons() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select("season_id")
        .not("season_id", "is", null)
        .order("season_id", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (fetchError) {
        setSeasons([]);
        setError(fetchError.message || "Failed to load filters.");
      } else {
        setSeasons(getSeasonsFromMatches((data || []) as MatchSeasonRow[]));
      }

      setLoading(false);
    }

    loadSeasons();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  return {
    seasons,
    loading,
    error,
  };
}