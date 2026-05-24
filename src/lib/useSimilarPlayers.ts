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
  player_id: number | string | null;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  initial_rating: number | string | null;
};

type MatchPlayerRatingRow = {
  player_id: number | string | null;
  match_id: number | string | null;
  rating_post: number | string | null;
  formula_name: string | null;
};

type MatchMetaRow = {
  match_id: number | string | null;
  date_local: string | null;
  time_local: string | null;
  status: string | null;
};

type PlayerLatestRating = {
  rating: number;
  dateLocal: string | null;
  timeLocal: string | null;
  matchId: number;
  priority: number;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableStringDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

function compareMatchRecencyDesc(
  candidate: { dateLocal: string | null; timeLocal: string | null; matchId: number },
  existing: { dateLocal: string | null; timeLocal: string | null; matchId: number },
): number {
  const byDate = compareNullableStringDesc(candidate.dateLocal, existing.dateLocal);
  if (byDate !== 0) return byDate;

  const byTime = compareNullableStringDesc(candidate.timeLocal, existing.timeLocal);
  if (byTime !== 0) return byTime;

  return existing.matchId - candidate.matchId;
}

function toFormulaPriority(formulaName: unknown): number {
  const formula = String(formulaName || "").toLowerCase();
  return formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
}

function byRatingThenName(a: SimilarPlayer, b: SimilarPlayer): number {
  if (b.latestRating !== a.latestRating) return b.latestRating - a.latestRating;
  const aName = (a.name ?? "").toLowerCase();
  const bName = (b.name ?? "").toLowerCase();
  return aName.localeCompare(bName);
}

export function useSimilarPlayers(
  currentPlayerId: string | number | null,
): UseSimilarPlayersResult {
  const [players, setPlayers] = useState<SimilarPlayer[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentPlayerId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: playerRows, error: playersError } = await supabase
        .from("players")
        .select("player_id, name, nickname, image_link, initial_rating")
        .order("name", { ascending: true });

      if (cancelled) return;

      if (playersError || !playerRows) {
        console.error("[useSimilarPlayers] players fetch error:", playersError);
        setPlayers([]);
        setCurrentPlayerIndex(-1);
        setLoading(false);
        return;
      }

      const rows = (playerRows ?? []) as SimilarPlayerRow[];
      const playerIds = rows
        .map((row) => toFiniteNumber(row.player_id))
        .filter((id): id is number => id !== null);

      const latestByPlayer = new Map<string, PlayerLatestRating>();

      if (playerIds.length > 0) {
        const { data: ratingRows, error: ratingsError } = await supabase
          .from("match_player_ratings")
          .select("player_id, match_id, rating_post, formula_name")
          .in("player_id", playerIds);

        if (cancelled) return;

        if (ratingsError) {
          console.error("[useSimilarPlayers] ratings fetch error:", ratingsError);
        } else {
          const typedRatingRows = (ratingRows ?? []) as MatchPlayerRatingRow[];
          const matchIds = Array.from(
            new Set(
              typedRatingRows
                .map((row) => toFiniteNumber(row.match_id))
                .filter((id): id is number => id !== null),
            ),
          );

          if (matchIds.length > 0) {
            const { data: matchRows, error: matchesError } = await supabase
              .from("matches")
              .select("match_id, date_local, time_local, status")
              .in("match_id", matchIds)
              .eq("status", "completed");

            if (cancelled) return;

            if (matchesError) {
              console.error("[useSimilarPlayers] matches fetch error:", matchesError);
            } else {
              const completedMatches = new Map<number, MatchMetaRow>();
              for (const matchRow of (matchRows ?? []) as MatchMetaRow[]) {
                const matchId = toFiniteNumber(matchRow.match_id);
                if (matchId === null) continue;
                completedMatches.set(matchId, matchRow);
              }

              for (const ratingRow of typedRatingRows) {
                const playerId = toFiniteNumber(ratingRow.player_id);
                const matchId = toFiniteNumber(ratingRow.match_id);
                const ratingPost = toFiniteNumber(ratingRow.rating_post);

                if (playerId === null || matchId === null || ratingPost === null) {
                  continue;
                }

                const match = completedMatches.get(matchId);
                if (!match) {
                  continue;
                }

                const key = String(playerId);
                const existing = latestByPlayer.get(key);
                const candidate: PlayerLatestRating = {
                  rating: ratingPost,
                  dateLocal: match.date_local ?? null,
                  timeLocal: match.time_local ?? null,
                  matchId,
                  priority: toFormulaPriority(ratingRow.formula_name),
                };

                if (!existing) {
                  latestByPlayer.set(key, candidate);
                  continue;
                }

                const recency = compareMatchRecencyDesc(candidate, existing);
                if (recency < 0) {
                  latestByPlayer.set(key, candidate);
                  continue;
                }

                if (recency === 0 && candidate.priority >= existing.priority) {
                  latestByPlayer.set(key, candidate);
                }
              }
            }
          }
        }
      }

      const normalizedCurrentPlayerId = String(currentPlayerId);
      const mapped: SimilarPlayer[] = rows
        .map((row) => {
          const playerId = toFiniteNumber(row.player_id);
          if (playerId === null) return null;

          const playerKey = String(playerId);
          const latest = latestByPlayer.get(playerKey);
          const initialRating = toFiniteNumber(row.initial_rating);
          const latestRating = latest?.rating ?? initialRating ?? 0;

          return {
            id: playerKey,
            name: row.name ?? null,
            nickname: row.nickname ?? null,
            image_link: row.image_link ?? null,
            latestRating,
            lastMatchDate: latest?.dateLocal ?? null,
            isCurrentPlayer: playerKey === normalizedCurrentPlayerId,
            rank: 0,
          } as SimilarPlayer;
        })
        .filter((player): player is SimilarPlayer => player !== null)
        .sort(byRatingThenName)
        .map((player, index) => ({
          ...player,
          rank: index + 1,
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
