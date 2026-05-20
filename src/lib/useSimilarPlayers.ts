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

type PlayerSummaryRow = {
  player_id: number | string;
  latest_rating: number | string | null;
  latest_match_date: string | null;
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
      const { data: allPlayers } = await supabase
        .from("players")
        .select("player_id, name, nickname, image_link, initial_rating");

      if (cancelled || !allPlayers) {
        setLoading(false);
        return;
      }

      const numericIds = allPlayers
        .map((p) => Number(p.player_id))
        .filter((id) => Number.isInteger(id) && id > 0);

      const { data: summaries } = await supabase.rpc("get_player_summary", {
        p_ids: numericIds,
      });

      if (cancelled) return;

      const ratingMap: Record<string, number | null> = {};
      const matchDateMap: Record<string, string | null> = {};

      ((summaries || []) as PlayerSummaryRow[]).forEach((row) => {
        const key = String(row.player_id);
        const r = Number(row.latest_rating);
        ratingMap[key] = Number.isFinite(r) ? r : null;
        matchDateMap[key] = row.latest_match_date || null;
      });

      const currentIdStr = String(currentPlayerId);

      const enriched: SimilarPlayer[] = allPlayers
        .filter((p) => {
          const key = String(p.player_id);
          const initialRating = Number(p.initial_rating);
          return ratingMap[key] != null || Number.isFinite(initialRating);
        })
        .map((p) => {
          const key = String(p.player_id);
          const initialRating = Number(p.initial_rating);
          const latestRating =
            ratingMap[key] ??
            (Number.isFinite(initialRating) ? initialRating : 0);
          return {
            id: key,
            name: p.name ?? null,
            nickname: p.nickname ?? null,
            image_link: p.image_link ?? null,
            latestRating,
            lastMatchDate: matchDateMap[key] ?? null,
            isCurrentPlayer: key === currentIdStr,
            rank: 0,
          };
        })
        .sort((a, b) => b.latestRating - a.latestRating)
        .map((p, i) => ({ ...p, rank: i + 1 }));

      const idx = enriched.findIndex((p) => p.id === currentIdStr);

      if (idx === -1) {
        setPlayers([]);
        setCurrentPlayerIndex(-1);
        setLoading(false);
        return;
      }

      const start = Math.max(0, idx - 15);
      const end = Math.min(enriched.length, idx + 16);
      const sliced = enriched.slice(start, end);
      const adjustedIdx = idx - start;

      setPlayers(sliced);
      setCurrentPlayerIndex(adjustedIdx);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPlayerId]);

  return { players, currentPlayerIndex, loading };
}
