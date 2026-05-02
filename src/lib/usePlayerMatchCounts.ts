"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type UsePlayerMatchCountsResult = {
  matchCounts: Record<string, number>;
  latestMatchDates: Record<string, string | null>;
  latestRatings: Record<string, number | null>;
  loading: boolean;
};

type PlayerIdRow = {
  match_id?: number;
  player_1_id?: number | string | null;
  player_2_id?: number | string | null;
};

type MatchDateRow = {
  match_id: number;
  date_local: string | null;
  time_local?: string | null;
  event_id?: number | null;
};

type MatchRatingRow = {
  match_id: number;
  player_id: number | string;
  rating_post: number | null;
  formula_name: string | null;
};

export function usePlayerMatchCounts(
  playerIds: Array<number | string>,
): UsePlayerMatchCountsResult {
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  const [latestMatchDates, setLatestMatchDates] = useState<
    Record<string, string | null>
  >({});
  const [latestRatings, setLatestRatings] = useState<
    Record<string, number | null>
  >({});
  const [loading, setLoading] = useState(false);

  const normalizedIds = useMemo(() => {
    return Array.from(new Set(playerIds.map((id) => String(id)).filter(Boolean)));
  }, [playerIds]);

  useEffect(() => {
    if (normalizedIds.length === 0) {
      setMatchCounts({});
      setLatestMatchDates({});
      setLatestRatings({});
      setLoading(false);
      return;
    }

    let isCancelled = false;

    async function fetchMatchCounts() {
      setLoading(true);

      const [playerOneResult, playerTwoResult] = await Promise.all([
        supabase
          .from("match_teams")
          .select("match_id, player_1_id")
          .in("player_1_id", normalizedIds),
        supabase
          .from("match_teams")
          .select("match_id, player_2_id")
          .in("player_2_id", normalizedIds),
      ]);

      if (isCancelled) {
        return;
      }

      const counts: Record<string, number> = {};
      const latestDates: Record<string, string | null> = {};
      const latestRatingValues: Record<string, number | null> = {};
      normalizedIds.forEach((id) => {
        counts[id] = 0;
        latestDates[id] = null;
        latestRatingValues[id] = null;
      });

      const matchIds = new Set<number>();
      (playerOneResult.data || []).forEach((row) => {
        const matchId = Number((row as PlayerIdRow).match_id);
        if (Number.isInteger(matchId) && matchId > 0) {
          matchIds.add(matchId);
        }
      });
      (playerTwoResult.data || []).forEach((row) => {
        const matchId = Number((row as PlayerIdRow).match_id);
        if (Number.isInteger(matchId) && matchId > 0) {
          matchIds.add(matchId);
        }
      });

      const matchDateById = new Map<number, string | null>();
      if (matchIds.size > 0) {
        const { data: matchesData } = await supabase
          .from("matches")
          .select("match_id, date_local, time_local, event_id")
          .in("match_id", Array.from(matchIds));

        ((matchesData || []) as MatchDateRow[]).forEach((row) => {
          matchDateById.set(Number(row.match_id), row.date_local || null);
        });

        const matchRecency = new Map<number, number>();
        ((matchesData || []) as MatchDateRow[]).forEach((row) => {
          const matchId = Number(row.match_id);
          if (!Number.isInteger(matchId) || matchId <= 0) {
            return;
          }

          const datePart = typeof row.date_local === "string" ? row.date_local.trim() : "";
          const timePart = typeof row.time_local === "string" ? row.time_local.trim() : "";
          let recency = Number.NEGATIVE_INFINITY;

          if (datePart) {
            const withTime = Date.parse(`${datePart}T${timePart || "00:00:00"}`);
            const dateOnly = Date.parse(datePart);
            if (Number.isFinite(withTime)) {
              recency = withTime;
            } else if (Number.isFinite(dateOnly)) {
              recency = dateOnly;
            }
          }

          if (!Number.isFinite(recency)) {
            const eventId = Number(row.event_id);
            if (Number.isFinite(eventId)) {
              recency = eventId;
            } else {
              recency = matchId;
            }
          }

          matchRecency.set(matchId, recency);
        });

        const { data: ratingsData } = await supabase
          .from("match_player_ratings")
          .select("match_id, player_id, rating_post, formula_name")
          .in("match_id", Array.from(matchIds));

        const ratingSelection = new Map<
          string,
          { recency: number; priority: number; rating: number }
        >();

        ((ratingsData || []) as MatchRatingRow[]).forEach((row) => {
          const playerId = String(row.player_id);
          if (!(playerId in latestRatingValues)) {
            return;
          }

          const rating = Number(row.rating_post);
          if (!Number.isFinite(rating)) {
            return;
          }

          const matchId = Number(row.match_id);
          const recency = matchRecency.get(matchId) ?? Number.NEGATIVE_INFINITY;
          const formula = String(row.formula_name || "").toLowerCase();
          const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;

          const current = ratingSelection.get(playerId);
          if (!current) {
            ratingSelection.set(playerId, { recency, priority, rating });
            return;
          }

          if (recency > current.recency) {
            ratingSelection.set(playerId, { recency, priority, rating });
            return;
          }

          if (recency === current.recency && priority >= current.priority) {
            ratingSelection.set(playerId, { recency, priority, rating });
          }
        });

        ratingSelection.forEach((value, playerId) => {
          latestRatingValues[playerId] = value.rating;
        });
      }

      const updateLatestDate = (playerId: string, matchId?: number) => {
        if (!matchId) {
          return;
        }

        const candidate = matchDateById.get(matchId) || null;
        if (!candidate) {
          return;
        }

        const current = latestDates[playerId];
        if (!current) {
          latestDates[playerId] = candidate;
          return;
        }

        const currentTime = Date.parse(`${current}T00:00:00`);
        const candidateTime = Date.parse(`${candidate}T00:00:00`);
        if (Number.isFinite(candidateTime) && Number.isFinite(currentTime)) {
          if (candidateTime > currentTime) {
            latestDates[playerId] = candidate;
          }
          return;
        }

        if (candidate > current) {
          latestDates[playerId] = candidate;
        }
      };

      if (!playerOneResult.error) {
        ((playerOneResult.data || []) as PlayerIdRow[]).forEach((row) => {
          const id = row.player_1_id != null ? String(row.player_1_id) : null;
          if (id && id in counts) {
            counts[id] += 1;
            updateLatestDate(id, row.match_id);
          }
        });
      }

      if (!playerTwoResult.error) {
        ((playerTwoResult.data || []) as PlayerIdRow[]).forEach((row) => {
          const id = row.player_2_id != null ? String(row.player_2_id) : null;
          if (id && id in counts) {
            counts[id] += 1;
            updateLatestDate(id, row.match_id);
          }
        });
      }

      setMatchCounts(counts);
      setLatestMatchDates(latestDates);
      setLatestRatings(latestRatingValues);
      setLoading(false);
    }

    fetchMatchCounts();

    return () => {
      isCancelled = true;
    };
  }, [normalizedIds]);

  return {
    matchCounts,
    latestMatchDates,
    latestRatings,
    loading,
  };
}
