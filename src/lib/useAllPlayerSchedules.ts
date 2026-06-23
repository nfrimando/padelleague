"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";

export type SchedulePlayer = {
  id: string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  preferred_side: "left" | "right" | "both" | null;
  latestRating: number | null;
};

export type ScheduleRow = {
  playerId: string;
  dayOfWeek: number;
  startHour: number;
};

type UseAllPlayerSchedulesResult = {
  rows: ScheduleRow[];
  playersById: Map<string, SchedulePlayer>;
  loading: boolean;
  reload: () => void;
};

type PrefRow = {
  player_id: number | string;
  day_of_week: number;
  start_hour: number;
};

type PlayerMetaRow = {
  player_id: number | string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  preferred_side: "left" | "right" | "both" | null;
};

// Loads the whole league's weekly availability from `player_schedule_preferences`
// in three light, batched queries (run once, re-run on `reload`): the raw schedule
// rows, the meta of the players who appear in them, and their effective ratings.
// Rating filtering / grid bucketing is left to the caller (a client-side memo over
// `rows` + `playersById`) so changing the filter never triggers a refetch.
export function useAllPlayerSchedules(): UseAllPlayerSchedulesResult {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [playersById, setPlayersById] = useState<Map<string, SchedulePlayer>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: prefData, error: prefError } = await supabase
        .from("player_schedule_preferences")
        .select("player_id, day_of_week, start_hour");

      if (cancelled) return;

      if (prefError || !prefData) {
        console.error("[useAllPlayerSchedules] schedule fetch error:", prefError);
        setRows([]);
        setPlayersById(new Map());
        setLoading(false);
        return;
      }

      const scheduleRows: ScheduleRow[] = (prefData as PrefRow[]).map((r) => ({
        playerId: String(r.player_id),
        dayOfWeek: r.day_of_week,
        startHour: r.start_hour,
      }));

      const distinctIds = Array.from(new Set(scheduleRows.map((r) => r.playerId)));

      if (distinctIds.length === 0) {
        setRows([]);
        setPlayersById(new Map());
        setLoading(false);
        return;
      }

      const [metaResult, ratings] = await Promise.all([
        supabase
          .from("players")
          .select("player_id, name, nickname, image_link, preferred_side")
          .in("player_id", distinctIds.map(Number)),
        fetchLatestRatingsByPlayerIds(supabase, distinctIds),
      ]);

      if (cancelled) return;

      const map = new Map<string, SchedulePlayer>();
      for (const m of (metaResult.data ?? []) as PlayerMetaRow[]) {
        const id = String(m.player_id);
        map.set(id, {
          id,
          name: m.name,
          nickname: m.nickname,
          image_link: m.image_link,
          preferred_side: m.preferred_side ?? null,
          latestRating: ratings.get(id) ?? null,
        });
      }

      // Drop schedule rows whose player meta is missing (defensive).
      setRows(scheduleRows.filter((r) => map.has(r.playerId)));
      setPlayersById(map);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { rows, playersById, loading, reload };
}
