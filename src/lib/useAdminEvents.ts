"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AdminEventRow = {
  event_id: number;
  name?: string | null;
  event_type: string;
  start_date?: string | null;
  end_date?: string | null;
  registration_fee?: number | null;
  registration_status: string;
  status: string;
  created_at: string;
};

export function useAdminEvents(enabled = true) {
  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("events")
      .select("*")
      .order("event_id", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setEvents((data ?? []) as AdminEventRow[]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    events,
    setEvents,
    loading,
  };
}
