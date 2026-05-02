"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getEventsFromMatches } from "@/lib/matches";
import { useEventMap } from "@/lib/useEventMap";

type MatchEventRow = {
  event_id: number | null;
};

export type EventOption = {
  id: number;
  label: string;
};

export function useMatchEvents(enabled = true) {
  const [eventIds, setEventIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { eventMap, loading: eventsLoading } = useEventMap(enabled);

  useEffect(() => {
    if (!enabled) {
      setEventIds([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;

    async function loadEvents() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select("event_id")
        .not("event_id", "is", null)
        .order("event_id", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (fetchError) {
        setEventIds([]);
        setError(fetchError.message || "Failed to load filters.");
      } else {
        setEventIds(getEventsFromMatches((data || []) as MatchEventRow[]));
      }

      setLoading(false);
    }

    void loadEvents();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const events: EventOption[] = useMemo(
    () =>
      eventIds.map((id) => ({
        id,
        label: eventMap[id] ?? `Event ${id}`,
      })),
    [eventIds, eventMap],
  );

  return {
    events,
    loading: loading || eventsLoading,
    error,
  };
}
