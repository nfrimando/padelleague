"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ScheduleSlot = { day_of_week: number; start_hour: number };

type UsePlayerSchedulesResult = {
  schedules: Map<string, ScheduleSlot[]>;
  playerIdsWithNoSchedule: string[];
  loading: boolean;
};

export function usePlayerSchedules(playerIds: string[]): UsePlayerSchedulesResult {
  const [schedules, setSchedules] = useState<Map<string, ScheduleSlot[]>>(new Map());
  const [playerIdsWithNoSchedule, setPlayerIdsWithNoSchedule] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Stable key so the effect only re-runs when the actual IDs change
  const key = playerIds.slice().sort().join(",");

  useEffect(() => {
    if (playerIds.length === 0) {
      setSchedules(new Map());
      setPlayerIdsWithNoSchedule([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("player_schedule_preferences")
        .select("player_id, day_of_week, start_hour")
        .in("player_id", playerIds.map(Number));

      if (cancelled) return;

      if (error) {
        console.error("[usePlayerSchedules] fetch error:", error);
        setSchedules(new Map());
        setPlayerIdsWithNoSchedule([...playerIds]);
        setLoading(false);
        return;
      }

      const map = new Map<string, ScheduleSlot[]>();
      for (const row of data ?? []) {
        const id = String(row.player_id);
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push({ day_of_week: row.day_of_week, start_hour: row.start_hour });
      }

      const missing = playerIds.filter((id) => !map.has(id));

      setSchedules(map);
      setPlayerIdsWithNoSchedule(missing);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { schedules, playerIdsWithNoSchedule, loading };
}
