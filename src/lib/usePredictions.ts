"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type UserPick = {
  id: string;
  prediction: 1 | 2;
  pickProbability: number;
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
        .select("id,match_id,prediction,pick_probability")
        .eq("email", email!)
        .in("match_id", matchIds)
        .eq("type", "winning_team");

      if (cancelled) return;

      if (!error && data) {
        const map = new Map<number, UserPick>();
        for (const row of data) {
          if (row.match_id === null) continue;
          map.set(row.match_id, {
            id: row.id,
            prediction: row.prediction as 1 | 2,
            pickProbability: Number(row.pick_probability),
          });
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
