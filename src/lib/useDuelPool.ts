"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";

export type DuelPoolPlayer = {
  id: string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  preferred_side: "left" | "right" | "both" | null;
  latestRating: number;
};

type DuelPoolRow = {
  player_id: number | string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  preferred_side: "left" | "right" | "both" | null;
};

type UseDuelPoolResult = {
  pool: DuelPoolPlayer[];
  loading: boolean;
  reload: () => void;
};

// Players who have opted into the Duel Roulette pool, with their effective
// (ledger) rating, sorted high → low. Players with no ledger rating are omitted.
export function useDuelPool(): UseDuelPoolResult {
  const [pool, setPool] = useState<DuelPoolPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: rows, error } = await supabase
        .from("players")
        .select("player_id, name, nickname, image_link, preferred_side")
        .eq("is_duel_roulette_opt_in", true);

      if (cancelled) return;

      if (error || !rows) {
        console.error("[useDuelPool] fetch error:", error);
        setPool([]);
        setLoading(false);
        return;
      }

      const ids = (rows as DuelPoolRow[]).map((r) => r.player_id);
      const ratings = await fetchLatestRatingsByPlayerIds(supabase, ids);
      if (cancelled) return;

      const next = (rows as DuelPoolRow[])
        .map((r) => {
          const id = String(r.player_id);
          const latestRating = ratings.get(id) ?? null;
          if (latestRating === null) return null;
          return {
            id,
            name: r.name,
            nickname: r.nickname,
            image_link: r.image_link,
            preferred_side: r.preferred_side ?? null,
            latestRating,
          } satisfies DuelPoolPlayer;
        })
        .filter((p): p is DuelPoolPlayer => p !== null)
        .sort((a, b) => b.latestRating - a.latestRating);

      setPool(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { pool, loading, reload };
}
