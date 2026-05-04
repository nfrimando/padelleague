"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EventRow = {
  event_id: number | string | bigint;
  name: string | null;
  created_at: string | null;
  start_date: string | null;
  end_date: string | null;
};

type EventSnapshot = {
  eventMap: Record<number, string>;
  events: EventRow[];
};

let cachedEventSnapshot: EventSnapshot | null = null;
let inFlightEventSnapshotPromise: Promise<EventSnapshot> | null = null;

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

function buildEventSnapshot(rows: EventRow[]): EventSnapshot {
  const map: Record<number, string> = {};
  for (const row of rows) {
    const eventId = normalizeEventId(row.event_id);
    if (eventId !== null) {
      map[eventId] = buildEventLabel(row);
    }
  }
  return { eventMap: map, events: rows };
}

async function loadEventSnapshot(): Promise<EventSnapshot> {
  if (cachedEventSnapshot) {
    return cachedEventSnapshot;
  }

  if (!inFlightEventSnapshotPromise) {
    inFlightEventSnapshotPromise = (async () => {
      const primary = await supabase
        .from("events")
        .select("event_id, name, created_at, start_date, end_date")
        .order("event_id", { ascending: true });

      if (!primary.error) {
        return buildEventSnapshot((primary.data ?? []) as EventRow[]);
      }

      const fallback = await supabase
        .from("events")
        .select("event_id, name")
        .order("event_id", { ascending: true });

      const rows = ((fallback.data ?? []) as Array<Omit<EventRow, "created_at">>)
        .map((row) => ({
          ...row,
          created_at: null,
          start_date: null,
          end_date: null,
        }));

      return buildEventSnapshot(rows);
    })()
      .then((snapshot) => {
        cachedEventSnapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        inFlightEventSnapshotPromise = null;
      });
  }

  return inFlightEventSnapshotPromise;
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
    if (cachedEventSnapshot) {
      setEventMap(cachedEventSnapshot.eventMap);
      setEvents(cachedEventSnapshot.events);
      setLoading(false);
      return;
    }

    setLoading(true);
    void loadEventSnapshot().then((snapshot) => {
      if (cancelled) {
        return;
      }
      setEventMap(snapshot.eventMap);
      setEvents(snapshot.events);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { eventMap, events, loading };
}
