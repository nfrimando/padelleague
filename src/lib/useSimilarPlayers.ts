"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";

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

type PlayerRow = {
  player_id: number | string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

type MatchEventRow = {
  player_id: number | string;
  occurred_at: string | null;
};

// Total number of nearby players shown (matches the previous RPC's p_window: 24).
const WINDOW_SIZE = 24;

// Ranks every player by their true ledger rating (so a recalibrated player is
// surrounded by their new, correct peer group, not just shown a corrected number),
// then returns a window centered on currentPlayerId. Computed client-side instead of
// via the `get_similar_players` RPC, which is untracked in migrations and can't be
// safely verified or redefined — see CLAUDE.md / the recalibration feature plan.
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
      const { data: playerRows, error: playersError } = await supabase
        .from("players")
        .select("player_id, name, nickname, image_link");

      if (cancelled) return;

      if (playersError || !playerRows) {
        console.error("[useSimilarPlayers] players query error:", playersError);
        setPlayers([]);
        setCurrentPlayerIndex(-1);
        setLoading(false);
        return;
      }

      const allIds = (playerRows as PlayerRow[]).map((p) => p.player_id);

      const [latestRatingByPlayer, { data: matchEventRows }] = await Promise.all([
        fetchLatestRatingsByPlayerIds(supabase, allIds),
        supabase
          .from("player_rating_events")
          .select("player_id, occurred_at")
          .eq("source_type", "match")
          .in("player_id", allIds)
          .order("occurred_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      // last played date stays match-scoped on purpose — "last played" shouldn't move
      // just because a non-match rating event (e.g. recalibration) happened.
      const lastMatchDateByPlayer = new Map<string, string | null>();
      for (const row of (matchEventRows ?? []) as MatchEventRow[]) {
        const playerId = String(row.player_id);
        if (lastMatchDateByPlayer.has(playerId)) continue;
        lastMatchDateByPlayer.set(playerId, row.occurred_at ? row.occurred_at.slice(0, 10) : null);
      }

      const targetId = String(currentPlayerId);

      const ranked = (playerRows as PlayerRow[])
        .map((row) => {
          const id = String(row.player_id);
          const latestRating = latestRatingByPlayer.get(id) ?? null;
          if (latestRating === null) return null;
          return {
            id,
            name: row.name ?? null,
            nickname: row.nickname ?? null,
            image_link: row.image_link ?? null,
            latestRating,
            lastMatchDate: lastMatchDateByPlayer.get(id) ?? null,
            isCurrentPlayer: id === targetId,
            rank: 0,
          };
        })
        .filter((p): p is SimilarPlayer => p !== null)
        .sort((a, b) => b.latestRating - a.latestRating)
        .map((p, idx) => ({ ...p, rank: idx + 1 }));

      const targetIndex = ranked.findIndex((p) => p.isCurrentPlayer);

      if (targetIndex === -1) {
        setPlayers([]);
        setCurrentPlayerIndex(-1);
        setLoading(false);
        return;
      }

      const half = Math.floor(WINDOW_SIZE / 2);
      const start = Math.max(0, targetIndex - half);
      const end = Math.min(ranked.length, targetIndex + half + 1);
      const windowed = ranked.slice(start, end);

      setPlayers(windowed);
      setCurrentPlayerIndex(windowed.findIndex((p) => p.isCurrentPlayer));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPlayerId]);

  return { players, currentPlayerIndex, loading };
}
