"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MatchSet } from "@/lib/types";

type Cache = {
  playerId: string;
  data: Map<string, MatchSet[]>;
  loaded: Set<string>;
};

export function useMatchSetsLoader(playerId: string, matchIds: string[]) {
  const cacheRef = useRef<Cache>({ playerId: "", data: new Map(), loaded: new Set() });

  // Reset cache when player changes
  if (cacheRef.current.playerId !== playerId) {
    cacheRef.current = { playerId, data: new Map(), loaded: new Set() };
  }

  const [, forceUpdate] = useState(0);
  const [loading, setLoading] = useState(false);

  // Stable key to detect when matchIds list changes
  const idsKey = matchIds.join(",");

  useEffect(() => {
    const cache = cacheRef.current;
    if (cache.playerId !== playerId) return;

    const newIds = matchIds.filter((id) => !cache.loaded.has(id));
    if (newIds.length === 0) return;

    const numericIds = newIds
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (numericIds.length === 0) {
      newIds.forEach((id) => cache.loaded.add(id));
      return;
    }

    let cancelled = false;
    setLoading(true);

    void supabase
      .from("match_sets")
      .select("*")
      .in("match_id", numericIds)
      .order("set_number", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;

        for (const row of (data ?? []) as MatchSet[]) {
          const key = String(row.match_id);
          const arr = cache.data.get(key) ?? [];
          arr.push(row);
          cache.data.set(key, arr);
        }
        newIds.forEach((id) => cache.loaded.add(id));

        forceUpdate((v) => v + 1);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, idsKey]);

  return { setsByMatchId: cacheRef.current.data, loading };
}
