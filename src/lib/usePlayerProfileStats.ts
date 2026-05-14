"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MatchTeamRow, groupByMatchId, normalizeId } from "@/lib/matchAssembly";
import type { Player } from "@/lib/types";

type LightMatchRow = {
  match_id: number;
  created_at: string;
  event_id: number | null;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  winner_team: number | null;
  status: "scheduled" | "completed" | "forfeit" | "cancelled";
  youtube_link?: string | null;
};

type RatingRow = {
  match_id: number;
  rating_post: number | null;
  formula_name: string | null;
};

type PlayerTeamRow = {
  match_id: number;
  team_number: number | null;
};

export type RatingHistoryPoint = {
  rating: number;
  date: string | null;
};

export type PartnerStat = {
  player: Player;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
};

const RATING_HISTORY_POINTS = 5;

export type PlayerProfileStatsResult = {
  lightMatches: LightMatchRow[];
  teamsByMatchId: Map<string, MatchTeamRow[]>;
  matchCount: number;
  wins: number;
  winRate: number;
  partnerStats: PartnerStat[];
  latestRating: number | null;
  ratingHistory: RatingHistoryPoint[];
  loading: boolean;
};

export function usePlayerProfileStats(playerId: string | null): PlayerProfileStatsResult {
  const [lightMatches, setLightMatches] = useState<LightMatchRow[]>([]);
  const [teamsByMatchId, setTeamsByMatchId] = useState(() => new Map<string, MatchTeamRow[]>());
  const [matchCount, setMatchCount] = useState(0);
  const [wins, setWins] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [partnerStats, setPartnerStats] = useState<PartnerStat[]>([]);
  const [latestRating, setLatestRating] = useState<number | null>(null);
  const [ratingHistory, setRatingHistory] = useState<RatingHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) {
      setLightMatches([]);
      setTeamsByMatchId(new Map());
      setMatchCount(0);
      setWins(0);
      setWinRate(0);
      setPartnerStats([]);
      setLatestRating(null);
      setRatingHistory([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      // Step 1: Get player's own teams to find match_ids and team_number per match
      const { data: playerTeamsData, error: playerTeamsError } = await supabase
        .from("match_teams")
        .select("match_id, team_number")
        .or(`player_1_id.eq.${playerId},player_2_id.eq.${playerId}`);

      if (playerTeamsError || cancelled) {
        if (!cancelled) {
          setLightMatches([]);
          setTeamsByMatchId(new Map());
          setMatchCount(0);
          setWins(0);
          setWinRate(0);
          setPartnerStats([]);
          setLatestRating(null);
          setRatingHistory([]);
          setLoading(false);
        }
        return;
      }

      const playerTeams = (playerTeamsData ?? []) as PlayerTeamRow[];
      if (playerTeams.length === 0) {
        if (!cancelled) {
          setLightMatches([]);
          setTeamsByMatchId(new Map());
          setMatchCount(0);
          setWins(0);
          setWinRate(0);
          setPartnerStats([]);
          setLatestRating(null);
          setRatingHistory([]);
          setLoading(false);
        }
        return;
      }

      const matchIds = playerTeams.map((t) => t.match_id);
      const playerTeamNumByMatchId = new Map<number, number | null>(
        playerTeams.map((t) => [t.match_id, t.team_number]),
      );

      // Steps 2-4 in parallel
      const [allTeamsResult, matchesResult, ratingsResult] = await Promise.all([
        // Step 2: All teams for those matches (both player and opponent teams, with player joins)
        supabase
          .from("match_teams")
          .select(
            "match_id, uuid, team_number, sets_won, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
          )
          .in("match_id", matchIds),

        // Step 3: Light match metadata
        supabase
          .from("matches")
          .select(
            "match_id, created_at, event_id, date_local, time_local, venue, type, winner_team, status, youtube_link",
          )
          .in("match_id", matchIds)
          .order("date_local", { ascending: false, nullsFirst: false })
          .order("time_local", { ascending: false }),

        // Step 4: Rating history for this player only
        supabase
          .from("match_player_ratings")
          .select("match_id, rating_post, formula_name")
          .in("match_id", matchIds)
          .eq("player_id", playerId),
      ]);

      if (cancelled) return;

      const typedAllTeams = (allTeamsResult.data ?? []) as unknown as MatchTeamRow[];
      const typedMatches = (matchesResult.data ?? []) as LightMatchRow[];
      const typedRatings = (ratingsResult.data ?? []) as RatingRow[];

      const teamsById = groupByMatchId(typedAllTeams);

      // Compute match count (non-cancelled)
      const nonCancelled = typedMatches.filter((m) => m.status !== "cancelled");
      const completed = nonCancelled.filter((m) => m.status === "completed");

      // Compute wins
      let winCount = 0;
      for (const match of completed) {
        if (match.winner_team === null) continue;
        const playerTeamNum = playerTeamNumByMatchId.get(match.match_id);
        if (playerTeamNum !== undefined && playerTeamNum === match.winner_team) {
          winCount++;
        }
      }
      const wr = completed.length > 0 ? Math.round((winCount / completed.length) * 100) : 0;

      // Compute partner stats (from completed matches only)
      const partnerMap = new Map<string, { player: Player; wins: number; losses: number }>();
      for (const match of completed) {
        const playerTeamNum = playerTeamNumByMatchId.get(match.match_id);
        const matchTeams = teamsById.get(String(match.match_id)) ?? [];
        const myTeamRow = matchTeams.find((t) => t.team_number === playerTeamNum);
        if (!myTeamRow) continue;

        const partner =
          normalizeId(myTeamRow.player_1?.player_id) === playerId
            ? myTeamRow.player_2
            : myTeamRow.player_1;
        if (!partner?.player_id) continue;

        const key = normalizeId(partner.player_id);
        const entry = partnerMap.get(key) ?? { player: partner as Player, wins: 0, losses: 0 };
        if (match.winner_team === playerTeamNum) entry.wins++;
        else entry.losses++;
        partnerMap.set(key, entry);
      }

      const computedPartnerStats: PartnerStat[] = Array.from(partnerMap.values()).map(
        ({ player, wins: w, losses: l }) => ({
          player,
          matchesPlayed: w + l,
          wins: w,
          losses: l,
          winRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0,
        }),
      );

      // Compute rating history (last RATING_HISTORY_POINTS matches with ratings)
      const ratingPostByMatchId = new Map<number, { post: number; priority: number }>();
      for (const row of typedRatings) {
        const formula = String(row.formula_name ?? "").toLowerCase();
        const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
        const post = Number(row.rating_post);
        if (!Number.isFinite(post)) continue;
        const existing = ratingPostByMatchId.get(row.match_id);
        if (!existing || priority >= existing.priority) {
          ratingPostByMatchId.set(row.match_id, { post, priority });
        }
      }

      let latestRatingValue: number | null = null;
      const history: RatingHistoryPoint[] = [];
      for (const match of typedMatches) {
        const entry = ratingPostByMatchId.get(match.match_id);
        if (!entry) continue;
        if (latestRatingValue === null) latestRatingValue = entry.post;
        if (history.length < RATING_HISTORY_POINTS) {
          history.push({ rating: entry.post, date: match.date_local });
        }
        if (history.length >= RATING_HISTORY_POINTS) break;
      }
      history.reverse();

      if (cancelled) return;

      setLightMatches(typedMatches);
      setTeamsByMatchId(teamsById);
      setMatchCount(completed.length);
      setWins(winCount);
      setWinRate(wr);
      setPartnerStats(computedPartnerStats);
      setLatestRating(latestRatingValue);
      setRatingHistory(history);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return {
    lightMatches,
    teamsByMatchId,
    matchCount,
    wins,
    winRate,
    partnerStats,
    latestRating,
    ratingHistory,
    loading,
  };
}
