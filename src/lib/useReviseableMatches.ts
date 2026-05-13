"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ReviseableMatchOption = {
  match_id: number;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  winner_team: number | null;
  team1Player1Id: number | null;
  team1Player2Id: number | null;
  team2Player1Id: number | null;
  team2Player2Id: number | null;
  team1SetsWon: number | null;
  team2SetsWon: number | null;
};

type Options = {
  enabled: boolean;
};

function compareNullableStringDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type LatestMatchMeta = {
  matchId: number;
  dateLocal: string | null;
  timeLocal: string | null;
};

function isCandidateNewer(
  candidate: LatestMatchMeta,
  existing: LatestMatchMeta,
): boolean {
  const byDate = compareNullableStringDesc(candidate.dateLocal, existing.dateLocal);
  if (byDate < 0) return true;
  if (byDate > 0) return false;

  const byTime = compareNullableStringDesc(candidate.timeLocal, existing.timeLocal);
  if (byTime < 0) return true;
  if (byTime > 0) return false;

  return candidate.matchId > existing.matchId;
}

export function useReviseableMatches({ enabled }: Options) {
  const [matches, setMatches] = useState<ReviseableMatchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMatches([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = toLocalDateString(sevenDaysAgo);

      // Fetch completed matches first. Eligibility is based only on completed
      // matches, and "latest" is resolved within this completed set.
      const { data: completedMatches, error: matchesError } = await supabase
        .from("matches")
        .select("match_id, date_local, time_local, venue, type, winner_team")
        .eq("status", "completed")
        .gte("date_local", cutoffDate)
        .order("date_local", { ascending: false })
        .order("time_local", { ascending: false })
        .order("match_id", { ascending: false });

      if (cancelled) return;
      if (matchesError) {
        setError(matchesError.message || "Failed to load completed matches.");
        setLoading(false);
        return;
      }

      const matchIds = (completedMatches ?? []).map((m) => m.match_id);

      const { data: teamRows, error: teamsError } =
        matchIds.length > 0
          ? await supabase
              .from("match_teams")
              .select("match_id, team_number, player_1_id, player_2_id, sets_won")
              .in("match_id", matchIds)
          : { data: [], error: null };

      if (cancelled) return;
      if (teamsError) {
        setError(teamsError.message || "Failed to load match teams.");
        setLoading(false);
        return;
      }

      // Build a date/time lookup from already-fetched completed matches so we can
      // compare recency per player without additional joins.
      const matchDateMap = new Map<
        number,
        { dateLocal: string | null; timeLocal: string | null }
      >();
      for (const m of (completedMatches ?? []) as Array<{
        match_id: number;
        date_local: string | null;
        time_local: string | null;
      }>) {
        matchDateMap.set(m.match_id, {
          dateLocal: m.date_local,
          timeLocal: m.time_local,
        });
      }

      type TeamInfo = {
        team1Player1Id: number | null;
        team1Player2Id: number | null;
        team2Player1Id: number | null;
        team2Player2Id: number | null;
        team1SetsWon: number | null;
        team2SetsWon: number | null;
      };
      const teamMap = new Map<number, TeamInfo>();
      for (const row of (teamRows ?? []) as Array<{
        match_id: number;
        team_number: number | null;
        player_1_id: number | null;
        player_2_id: number | null;
        sets_won: number | null;
      }>) {
        const existing = teamMap.get(row.match_id) ?? {
          team1Player1Id: null,
          team1Player2Id: null,
          team2Player1Id: null,
          team2Player2Id: null,
          team1SetsWon: null,
          team2SetsWon: null,
        };
        if (row.team_number === 1) {
          existing.team1Player1Id = row.player_1_id;
          existing.team1Player2Id = row.player_2_id;
          existing.team1SetsWon = row.sets_won;
        } else if (row.team_number === 2) {
          existing.team2Player1Id = row.player_1_id;
          existing.team2Player2Id = row.player_2_id;
          existing.team2SetsWon = row.sets_won;
        }
        teamMap.set(row.match_id, existing);
      }

      // Compute each player's latest completed match from completed matches + team rows,
      // independent of ratings rows.
      const latestMatchByPlayer = new Map<number, number>();
      const latestMetaByPlayer = new Map<number, LatestMatchMeta>();
      for (const row of (teamRows ?? []) as Array<{
        match_id: number;
        player_1_id: number | null;
        player_2_id: number | null;
      }>) {
        const dateMeta = matchDateMap.get(row.match_id);
        const candidate: LatestMatchMeta = {
          matchId: row.match_id,
          dateLocal: dateMeta?.dateLocal ?? null,
          timeLocal: dateMeta?.timeLocal ?? null,
        };

        for (const playerId of [row.player_1_id, row.player_2_id]) {
          if (typeof playerId !== "number") continue;
          const existing = latestMetaByPlayer.get(playerId);
          if (!existing || isCandidateNewer(candidate, existing)) {
            latestMetaByPlayer.set(playerId, candidate);
            latestMatchByPlayer.set(playerId, candidate.matchId);
          }
        }
      }

      // A match is eligible if all 4 players' latest completed match is this match
      const eligible: ReviseableMatchOption[] = [];
      for (const match of (completedMatches ?? []) as Array<{
        match_id: number;
        date_local: string | null;
        time_local: string | null;
        venue: string | null;
        type: string | null;
        winner_team: number | null;
      }>) {
        const team = teamMap.get(match.match_id);
        if (!team) continue;

        const playerIds = [
          team.team1Player1Id,
          team.team1Player2Id,
          team.team2Player1Id,
          team.team2Player2Id,
        ].filter((id): id is number => typeof id === "number");

        if (playerIds.length !== 4) continue;

        const allLatest = playerIds.every(
          (pid) => latestMatchByPlayer.get(pid) === match.match_id,
        );
        if (!allLatest) continue;

        eligible.push({
          match_id: match.match_id,
          date_local: match.date_local,
          time_local: match.time_local,
          venue: match.venue,
          type: match.type,
          winner_team: match.winner_team,
          ...team,
        });
      }

      eligible.sort((a, b) => {
        const byDate = compareNullableStringDesc(a.date_local, b.date_local);
        if (byDate !== 0) return byDate;
        const byTime = compareNullableStringDesc(a.time_local, b.time_local);
        if (byTime !== 0) return byTime;
        return b.match_id - a.match_id;
      });

      setMatches(eligible);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { matches, loading, error };
}
