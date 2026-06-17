"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PlayerRatingEvent } from "@/lib/types";

// Columns selected from player_rating_events; shared so other hooks fetch the same shape.
export const RATING_EVENTS_SELECT =
  "id, player_id, event_type, rating_before, rating_after, rating_delta, source_type, source_id, occurred_at, metadata";

export type RatingEventRow = {
  id: string;
  player_id: number | string;
  event_type: string;
  rating_before: number | string | null;
  rating_after: number | string | null;
  rating_delta: number | string | null;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

export function mapRatingEventRow(row: RatingEventRow): PlayerRatingEvent {
  return {
    id: String(row.id),
    playerId: String(row.player_id),
    eventType: row.event_type,
    ratingBefore: row.rating_before == null ? null : Number(row.rating_before),
    ratingAfter: Number(row.rating_after),
    ratingDelta: row.rating_delta == null ? null : Number(row.rating_delta),
    sourceType: row.source_type,
    sourceId: row.source_id,
    occurredAt: row.occurred_at,
    metadata: row.metadata ?? null,
  };
}

export type PlayerRatingEventsResult = {
  events: PlayerRatingEvent[];
  latestRating: number | null;
  loading: boolean;
};

// Canonical client-side source for a player's current/effective rating + rating progression.
// Returns events oldest → newest; latestRating is the most recent event's rating_after.
export function usePlayerRatingEvents(
  playerId: string | null,
): PlayerRatingEventsResult {
  const [events, setEvents] = useState<PlayerRatingEvent[]>([]);
  const [latestRating, setLatestRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) {
      setEvents([]);
      setLatestRating(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      const { data, error } = await supabase
        .from("player_rating_events")
        .select(RATING_EVENTS_SELECT)
        .eq("player_id", playerId)
        .order("occurred_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setEvents([]);
        setLatestRating(null);
        setLoading(false);
        return;
      }

      const mapped = ((data ?? []) as RatingEventRow[])
        .map(mapRatingEventRow)
        .filter((e) => Number.isFinite(e.ratingAfter));

      setEvents(mapped);
      setLatestRating(
        mapped.length > 0 ? mapped[mapped.length - 1].ratingAfter : null,
      );
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return { events, latestRating, loading };
}
