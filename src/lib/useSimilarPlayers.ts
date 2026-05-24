"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type SimilarPlayer = {
  id: string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  latestRating: number;
  lastMatchDate: string | null;
  isCurrentPlayer: boolean;
  rank: number;
};

type UseSimilarPlayersResult = {
  players: SimilarPlayer[];
  currentPlayerIndex: number;
  loading: boolean;
};

type SimilarPlayerRow = {
  player_id: number | string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  latest_rating: number | string | null;
  last_match_date: string | null;
  rank: number | string;
  is_current_player: boolean;
};

export function useSimilarPlayers(
  currentPlayerId: string | number | null,
): UseSimilarPlayersResult {
  const [players, setPlayers] = useState<SimilarPlayer[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentPlayerId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase.rpc("get_similar_players", {
        p_player_id: Number(currentPlayerId),
        p_window: 24,
      });

      if (cancelled) return;

      if (error || !data) {
        console.error("[useSimilarPlayers] RPC error:", error);
        setPlayers([]);
        setCurrentPlayerIndex(-1);
        setLoading(false);
        return;
      }

      const rows = data as SimilarPlayerRow[];
      const mapped: SimilarPlayer[] = rows.map((row) => ({
        id: String(row.player_id),
        name: row.name ?? null,
        nickname: row.nickname ?? null,
        image_link: row.image_link ?? null,
        latestRating: Number(row.latest_rating ?? 0),
        lastMatchDate: row.last_match_date ?? null,
        isCurrentPlayer: row.is_current_player,
        rank: Number(row.rank),
      }));

      const idx = mapped.findIndex((p) => p.isCurrentPlayer);

      setPlayers(mapped);
      setCurrentPlayerIndex(idx);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPlayerId]);

  return { players, currentPlayerIndex, loading };
}
