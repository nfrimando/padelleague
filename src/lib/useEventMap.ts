"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EventRow = {
  event_id: number | string | bigint;
  name: string | null;
  created_at: string | null;
};

function normalizeEventId(value: number | string | bigint): number | null {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "bigint"
        ? Number(value)
        : Number.parseInt(value, 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function buildEventLabel(row: EventRow): string {
  if (row.name) return row.name;
  return `Event ${row.event_id}`;
}

export function useEventMap(enabled = true) {
  const [eventMap, setEventMap] = useState<Record<number, string>>({});
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEventMap({});
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const loadEvents = async () => {
      const primary = await supabase
        .from("events")
        .select("event_id, name, created_at")
        .order("event_id", { ascending: true });

      if (!cancelled && !primary.error) {
        const rows = (primary.data ?? []) as EventRow[];
        const map: Record<number, string> = {};
        for (const row of rows) {
          const eventId = normalizeEventId(row.event_id);
          if (eventId !== null) {
            map[eventId] = buildEventLabel(row);
          }
        }
        setEvents(rows);
        setEventMap(map);
        setLoading(false);
        return;
      }

      const fallback = await supabase
        .from("events")
        .select("event_id, name")
        .order("event_id", { ascending: true });

      if (cancelled) {
        return;
      }

      const rows = ((fallback.data ?? []) as Array<
        Omit<EventRow, "created_at">
      >).map((row) => ({ ...row, created_at: null }));
      const map: Record<number, string> = {};
      for (const row of rows) {
        const eventId = normalizeEventId(row.event_id);
        if (eventId !== null) {
          map[eventId] = buildEventLabel(row);
        }
      }

      setEvents(rows);
      setEventMap(map);
      setLoading(false);
    };

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { eventMap, events, loading };
}
