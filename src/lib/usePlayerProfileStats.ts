"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  assembleMatchesWithTeamsAndSets,
  MatchRow,
  MatchTeamRow,
  groupByMatchId,
  normalizeId,
} from "@/lib/matchAssembly";
import {
  RATING_EVENTS_SELECT,
  RatingEventRow,
  mapRatingEventRow,
} from "@/lib/usePlayerRatingEvents";
import {
  describeRatingEvent,
  type RatingEventDescription,
} from "@/lib/ratingEventDisplay";
import type { MatchSet, MatchWithTeams, Player } from "@/lib/types";

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

type PlayerTeamRow = {
  match_id: number;
  team_number: number | null;
};

export type RatingHistoryPoint = {
  rating: number;
  date: string | null;
  detail?: RatingEventDescription | null;
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

    // Build enriched sparkline points from the player's last N ledger events.
    function buildRatingHistory(
      events: ReturnType<typeof mapRatingEventRow>[],
      matchesById: Map<string, MatchWithTeams>,
    ): RatingHistoryPoint[] {
      return events.slice(-RATING_HISTORY_POINTS).map((event) => {
        const match =
          event.sourceType === "match" && event.sourceId
            ? (matchesById.get(event.sourceId) ?? null)
            : null;
        return {
          rating: event.ratingAfter,
          date: match?.date_local ?? event.occurredAt,
          detail: describeRatingEvent(event, match, playerId as string),
        };
      });
    }

    async function load() {
      // Player's own teams (match_ids + team_number) and the rating-event ledger run in parallel.
      const [
        { data: playerTeamsData, error: playerTeamsError },
        { data: eventsData },
      ] = await Promise.all([
        supabase
          .from("match_teams")
          .select("match_id, team_number")
          .or(`player_1_id.eq.${playerId},player_2_id.eq.${playerId}`),
        supabase
          .from("player_rating_events")
          .select(RATING_EVENTS_SELECT)
          .eq("player_id", playerId)
          .order("occurred_at", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;

      const events = ((eventsData ?? []) as RatingEventRow[])
        .map(mapRatingEventRow)
        .filter((e) => Number.isFinite(e.ratingAfter));
      const latestRatingValue =
        events.length > 0 ? events[events.length - 1].ratingAfter : null;

      if (playerTeamsError) {
        setLightMatches([]);
        setTeamsByMatchId(new Map());
        setMatchCount(0);
        setWins(0);
        setWinRate(0);
        setPartnerStats([]);
        setLatestRating(latestRatingValue);
        setRatingHistory([]);
        setLoading(false);
        return;
      }

      const playerTeams = (playerTeamsData ?? []) as PlayerTeamRow[];
      if (playerTeams.length === 0) {
        setLightMatches([]);
        setTeamsByMatchId(new Map());
        setMatchCount(0);
        setWins(0);
        setWinRate(0);
        setPartnerStats([]);
        setLatestRating(latestRatingValue);
        // No matches → ratingHistory is just the initial_rating event (< 2 points = no sparkline).
        setRatingHistory(buildRatingHistory(events, new Map()));
        setLoading(false);
        return;
      }

      const matchIds = playerTeams.map((t) => t.match_id);
      const playerTeamNumByMatchId = new Map<number, number | null>(
        playerTeams.map((t) => [t.match_id, t.team_number]),
      );

      const [allTeamsResult, matchesResult, setsResult] = await Promise.all([
        supabase
          .from("match_teams")
          .select(
            "match_id, uuid, team_number, sets_won, player_1:player_1_id(player_id,name,nickname,image_link), player_2:player_2_id(player_id,name,nickname,image_link)",
          )
          .in("match_id", matchIds),

        supabase
          .from("matches")
          .select(
            "match_id, created_at, event_id, date_local, time_local, venue, type, winner_team, status, youtube_link",
          )
          .in("match_id", matchIds)
          .order("date_local", { ascending: false, nullsFirst: false })
          .order("time_local", { ascending: false })
          .order("match_id", { ascending: false }),

        supabase
          .from("match_sets")
          .select("match_id, set_number, team_1_games, team_2_games")
          .in("match_id", matchIds)
          .order("set_number", { ascending: true }),
      ]);

      if (cancelled) return;

      const typedAllTeams = (allTeamsResult.data ?? []) as unknown as MatchTeamRow[];
      const typedMatches = (matchesResult.data ?? []) as LightMatchRow[];
      const typedSets = (setsResult.data ?? []) as MatchSet[];

      const teamsById = groupByMatchId(typedAllTeams);
      const setsById = groupByMatchId(typedSets);

      // Assemble full matches (teams + sets) for rating-event tooltip detail.
      const assembled = assembleMatchesWithTeamsAndSets({
        matches: typedMatches as unknown as MatchRow[],
        teamsByMatchId: teamsById,
        setsByMatchId: setsById,
        ratingLookup: new Map(),
      });
      const matchesById = new Map<string, MatchWithTeams>(
        assembled.map((m) => [String(m.match_id), m]),
      );

      // Match count (non-cancelled) + wins
      const completed = typedMatches.filter((m) => m.status === "completed");
      let winCount = 0;
      for (const match of completed) {
        if (match.winner_team === null) continue;
        const playerTeamNum = playerTeamNumByMatchId.get(match.match_id);
        if (playerTeamNum !== undefined && playerTeamNum === match.winner_team) {
          winCount++;
        }
      }
      const wr = completed.length > 0 ? Math.round((winCount / completed.length) * 100) : 0;

      // Partner stats (completed matches only)
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

      if (cancelled) return;

      setLightMatches(typedMatches);
      setTeamsByMatchId(teamsById);
      setMatchCount(completed.length);
      setWins(winCount);
      setWinRate(wr);
      setPartnerStats(computedPartnerStats);
      setLatestRating(latestRatingValue);
      setRatingHistory(buildRatingHistory(events, matchesById));
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
