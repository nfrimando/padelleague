"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";

type UsePlayersOptions = {
  enabled?: boolean;
  orderByName?: boolean;
  onlyActivePlayers?: boolean;
  select?: string;
};

export function usePlayers(options: UsePlayersOptions = {}) {
  const {
    enabled = true,
    orderByName = false,
    onlyActivePlayers = false,
    select = "*",
  } = options;
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(enabled !== false);
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

      const table = onlyActivePlayers ? "active_players" : "players";
      let query = supabase.from(table).select(select);

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
        setPlayers((data || []) as unknown as Player[]);
      }

      setLoading(false);
    }

    fetchPlayers();

    return () => {
      isMounted = false;
    };
  }, [enabled, onlyActivePlayers, orderByName, select]);

  return {
    players,
    setPlayers,
    loading,
    error,
  };
}