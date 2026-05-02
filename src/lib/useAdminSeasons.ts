"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AdminSeasonRow = {
  season_id: number;
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  registration_fee?: number | null;
  registration_status: string;
  status: string;
  created_at: string;
};

export function useAdminSeasons(enabled = true) {
  const [seasons, setSeasons] = useState<AdminSeasonRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSeasons([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("seasons")
      .select("*")
      .order("season_id", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setSeasons((data ?? []) as AdminSeasonRow[]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    seasons,
    setSeasons,
    loading,
  };
}
