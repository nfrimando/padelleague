"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type UserPick = {
  id: string;
  prediction: 1 | 2;
  pickProbability: number;
  voidedAt: string | null;
};

export function usePredictions(email: string | null, matchIds: number[]) {
  const [picks, setPicks] = useState<Map<number, UserPick>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email || matchIds.length === 0) {
      setPicks(new Map());
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("predictions")
        .select("id,match_id,prediction,pick_probability,voided_at")
        .eq("email", email!)
        .in("match_id", matchIds)
        .eq("type", "winning_team")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (!error && data) {
        const map = new Map<number, UserPick>();
        for (const row of data) {
          if (row.match_id === null) continue;
          // Keep the first (most recent) row per match; prefer active over voided
          if (!map.has(row.match_id) || map.get(row.match_id)!.voidedAt !== null) {
            map.set(row.match_id, {
              id: row.id,
              prediction: row.prediction as 1 | 2,
              pickProbability: Number(row.pick_probability),
              voidedAt: (row.voided_at as string | null) ?? null,
            });
          }
        }
        setPicks(map);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, matchIds.join(",")]);

  return { picks, setPicks, loading };
}
