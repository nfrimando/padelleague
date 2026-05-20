"use client";

import { useMemo } from "react";
import { useEventMap } from "@/lib/useEventMap";

export type EventOption = {
  id: number;
  label: string;
};

export function useMatchEvents(enabled = true) {
  const { eventMap, events, loading } = useEventMap(enabled);

  const eventOptions: EventOption[] = useMemo(
    () =>
      events
        .map((row) => {
          const id =
            typeof row.event_id === "number"
              ? row.event_id
              : Number(row.event_id);
          return Number.isInteger(id) && id > 0
            ? { id, label: eventMap[id] ?? `Event ${id}` }
            : null;
        })
        .filter((e): e is EventOption => e !== null),
    [events, eventMap],
  );

  return {
    events: eventOptions,
    loading,
    error: null as string | null,
  };
}
