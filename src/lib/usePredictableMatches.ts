"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeV3ExpectedWinProbability } from "@/lib/ratings/v3/calculate";

export const PREDICT_DAYS_AHEAD = 2;

export type PredictablePlayer = {
  player_id: number;
  name: string;
  nickname: string | null;
  image_link: string | null;
  latest_rating: number | null;
};

export type PredictableMatch = {
  match_id: number;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  team1Player1: PredictablePlayer;
  team1Player2: PredictablePlayer;
  team2Player1: PredictablePlayer;
  team2Player2: PredictablePlayer;
  team1WinProbability: number;
  team2WinProbability: number;
};

type PlayerSummaryRow = {
  player_id: number | string;
  latest_rating: number | string | null;
};

export function usePredictableMatches() {
  const [matches, setMatches] = useState<PredictableMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const today = new Date();
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() + PREDICT_DAYS_AHEAD);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const todayStr = today.toISOString().slice(0, 10);

      const { data: matchRows, error: matchErr } = await supabase
        .from("matches")
        .select("match_id,date_local,time_local,venue,type")
        .eq("status", "scheduled")
        .gte("date_local", todayStr)
        .lte("date_local", cutoffStr)
        .order("date_local", { ascending: true })
        .order("time_local", { ascending: true });

      if (cancelled) return;
      if (matchErr) {
        setError(matchErr.message || "Failed to load matches.");
        setLoading(false);
        return;
      }

      const baseRows = (matchRows ?? []) as Array<{
        match_id: number;
        date_local: string | null;
        time_local: string | null;
        venue: string | null;
        type: string | null;
      }>;

      if (baseRows.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const matchIds = baseRows.map((r) => r.match_id);
      const { data: teamRows } = await supabase
        .from("match_teams")
        .select("match_id,team_number,player_1_id,player_2_id")
        .in("match_id", matchIds);

      if (cancelled) return;

      type TeamSlots = {
        t1p1: number | null;
        t1p2: number | null;
        t2p1: number | null;
        t2p2: number | null;
      };
      const teamMap = new Map<number, TeamSlots>();
      for (const row of teamRows ?? []) {
        const existing = teamMap.get(row.match_id) ?? {
          t1p1: null,
          t1p2: null,
          t2p1: null,
          t2p2: null,
        };
        if (row.team_number === 1) {
          existing.t1p1 = row.player_1_id;
          existing.t1p2 = row.player_2_id;
        } else if (row.team_number === 2) {
          existing.t2p1 = row.player_1_id;
          existing.t2p2 = row.player_2_id;
        }
        teamMap.set(row.match_id, existing);
      }

      // Only matches with all 4 players assigned
      const fullMatches = baseRows.filter((r) => {
        const t = teamMap.get(r.match_id);
        return t && t.t1p1 && t.t1p2 && t.t2p1 && t.t2p2;
      });

      if (fullMatches.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const playerIdSet = new Set<number>();
      for (const r of fullMatches) {
        const t = teamMap.get(r.match_id)!;
        playerIdSet.add(t.t1p1!);
        playerIdSet.add(t.t1p2!);
        playerIdSet.add(t.t2p1!);
        playerIdSet.add(t.t2p2!);
      }
      const allPlayerIds = Array.from(playerIdSet);

      // Fetch player info — include initial_rating as fallback for players with no match history
      const { data: playerRows } = await supabase
        .from("players")
        .select("player_id,name,nickname,image_link,initial_rating")
        .in("player_id", allPlayerIds);

      if (cancelled) return;

      // Fetch latest ratings via RPC
      const { data: summaryRows } = await supabase.rpc("get_player_summary", {
        p_ids: allPlayerIds,
      });

      if (cancelled) return;

      const playerMap = new Map<number, PredictablePlayer>();
      for (const p of playerRows ?? []) {
        const initialRating =
          p.initial_rating !== null && p.initial_rating !== undefined
            ? Number(p.initial_rating)
            : null;
        playerMap.set(p.player_id, {
          player_id: p.player_id,
          name: p.name ?? "",
          nickname: p.nickname ?? null,
          image_link: p.image_link ?? null,
          latest_rating: Number.isFinite(initialRating) ? initialRating : null,
        });
      }
      for (const row of (summaryRows ?? []) as PlayerSummaryRow[]) {
        const id = Number(row.player_id);
        const existing = playerMap.get(id);
        if (existing && row.latest_rating !== null && row.latest_rating !== undefined) {
          const rating = Number(row.latest_rating);
          if (Number.isFinite(rating)) {
            existing.latest_rating = rating;
          }
        }
      }

      const enriched: PredictableMatch[] = [];
      for (const r of fullMatches) {
        const t = teamMap.get(r.match_id)!;
        const t1p1 = playerMap.get(t.t1p1!);
        const t1p2 = playerMap.get(t.t1p2!);
        const t2p1 = playerMap.get(t.t2p1!);
        const t2p2 = playerMap.get(t.t2p2!);
        if (!t1p1 || !t1p2 || !t2p1 || !t2p2) continue;

        const r1 = t1p1.latest_rating;
        const r2 = t1p2.latest_rating;
        const r3 = t2p1.latest_rating;
        const r4 = t2p2.latest_rating;

        let team1WinProbability = 0.5;
        let team2WinProbability = 0.5;
        if (r1 != null && r2 != null && r3 != null && r4 != null) {
          [team1WinProbability, team2WinProbability] = computeV3ExpectedWinProbability(
            (r1 + r2) / 2,
            (r3 + r4) / 2,
          );
        }

        enriched.push({
          match_id: r.match_id,
          date_local: r.date_local,
          time_local: r.time_local,
          venue: r.venue,
          type: r.type,
          team1Player1: t1p1,
          team1Player2: t1p2,
          team2Player1: t2p1,
          team2Player2: t2p2,
          team1WinProbability,
          team2WinProbability,
        });
      }

      setMatches(enriched);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { matches, loading, error };
}
