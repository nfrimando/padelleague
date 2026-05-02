"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ScheduledMatchOption = {
  match_id: number;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  team1Player1Id: number | null;
  team1Player2Id: number | null;
  team2Player1Id: number | null;
  team2Player2Id: number | null;
};

type UseScheduledMatchesOptions = {
  enabled: boolean;
  refreshKey?: string | null;
};

export function useScheduledMatches({
  enabled,
  refreshKey = null,
}: UseScheduledMatchesOptions) {
  const [scheduledMatches, setScheduledMatches] = useState<ScheduledMatchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setScheduledMatches([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadScheduledMatches = async () => {
      setLoading(true);
      setError(null);

      const { data, error: matchesError } = await supabase
        .from("matches")
        .select("match_id,date_local,time_local,venue,type")
        .eq("status", "scheduled")
        .order("date_local", { ascending: true })
        .order("time_local", { ascending: true })
        .order("match_id", { ascending: true });

      if (cancelled) {
        return;
      }

      if (matchesError) {
        setScheduledMatches([]);
        setError(matchesError.message || "Failed to load scheduled matches.");
        setLoading(false);
        return;
      }

      const baseRows = (data ?? []) as Array<
        Omit<
          ScheduledMatchOption,
          "team1Player1Id" | "team1Player2Id" | "team2Player1Id" | "team2Player2Id"
        >
      >;

      const matchIds = baseRows.map((row) => row.match_id);
      const teamMap = new Map<
        number,
        {
          team1Player1Id: number | null;
          team1Player2Id: number | null;
          team2Player1Id: number | null;
          team2Player2Id: number | null;
        }
      >();

      if (matchIds.length > 0) {
        const { data: teamRows } = await supabase
          .from("match_teams")
          .select("match_id,team_number,player_1_id,player_2_id")
          .in("match_id", matchIds);

        for (const row of teamRows ?? []) {
          const existing = teamMap.get(row.match_id) ?? {
            team1Player1Id: null,
            team1Player2Id: null,
            team2Player1Id: null,
            team2Player2Id: null,
          };

          if (row.team_number === 1) {
            existing.team1Player1Id = row.player_1_id;
            existing.team1Player2Id = row.player_2_id;
          } else if (row.team_number === 2) {
            existing.team2Player1Id = row.player_1_id;
            existing.team2Player2Id = row.player_2_id;
          }

          teamMap.set(row.match_id, existing);
        }
      }

      const rows: ScheduledMatchOption[] = baseRows.map((row) => {
        const team = teamMap.get(row.match_id);
        return {
          ...row,
          team1Player1Id: team?.team1Player1Id ?? null,
          team1Player2Id: team?.team1Player2Id ?? null,
          team2Player1Id: team?.team2Player1Id ?? null,
          team2Player2Id: team?.team2Player2Id ?? null,
        };
      });

      setScheduledMatches(rows);
      setLoading(false);
    };

    void loadScheduledMatches();

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return {
    scheduledMatches,
    setScheduledMatches,
    loading,
    error,
  };
}
