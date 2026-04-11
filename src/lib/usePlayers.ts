"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

type UsePlayersOptions = {
  enabled?: boolean;
  orderByName?: boolean;
};

export function usePlayers(options: UsePlayersOptions = {}) {
  const { enabled = true, orderByName = false } = options;
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPlayers([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;

    async function fetchPlayers() {
      setLoading(true);
      setError(null);

      let query = supabase.from("players").select("*");

      if (orderByName) {
        query = query.order("name", { ascending: true });
      }

      const { data, error: fetchError } = await query;

      if (!isMounted) {
        return;
      }

      if (fetchError) {
        setPlayers([]);
        setError(fetchError.message || "Failed to load players");
      } else {
        setPlayers(data || []);
      }

      setLoading(false);
    }

    fetchPlayers();

    return () => {
      isMounted = false;
    };
  }, [enabled, orderByName]);

  return {
    players,
    setPlayers,
    loading,
    error,
  };
}