"use client";

import { useMemo } from "react";
import type { MatchWithTeams, Player, TeamWithPlayers } from "@/lib/types";

export type ChartPoint = {
  matchIndex: number;
  rating: number;
  match: MatchWithTeams;
  delta: number | null;
};

export type OpponentStat = {
  player: Player;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type PartnerStat = {
  player: Player;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type DashboardStats = {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  peakRating: number | null;
  ratingLast5Delta: number | null;
  currentStreak: { type: "W" | "L"; count: number } | null;
  chartData: ChartPoint[];
  opponentStats: OpponentStat[];
  partnerStats: PartnerStat[];
};

function findMyTeam(
  match: MatchWithTeams,
  pid: string,
): TeamWithPlayers | null {
  return (
    match.teams.find(
      (t) =>
        String(t.player_1?.player_id) === pid ||
        String(t.player_2?.player_id) === pid,
    ) ?? null
  );
}

function didWin(match: MatchWithTeams, myTeam: TeamWithPlayers): boolean {
  return (
    match.winner_team !== null && match.winner_team === myTeam.team_number
  );
}

export function useDashboardStats(
  matches: MatchWithTeams[],
  playerId: string | null,
  latestRating: number | null,
): DashboardStats {
  return useMemo(() => {
    const empty: DashboardStats = {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      peakRating: latestRating,
      ratingLast5Delta: null,
      currentStreak: null,
      chartData: [],
      opponentStats: [],
      partnerStats: [],
    };

    if (!playerId) return empty;

    const pid = playerId;
    const completedDesc = matches.filter((m) => m.status === "completed");

    // ── Win/loss counts ──────────────────────────────────────────────────────
    let wins = 0;
    let losses = 0;
    for (const m of completedDesc) {
      const myTeam = findMyTeam(m, pid);
      if (!myTeam) continue;
      if (didWin(m, myTeam)) wins++;
      else losses++;
    }
    const totalMatches = wins + losses;
    const winRate =
      totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    // ── Chart data (last 20 completed, chronological) ────────────────────────
    const chartSource = completedDesc.slice(0, 20).reverse();
    const chartData: ChartPoint[] = [];
    let prevRating: number | null = null;

    for (let i = 0; i < chartSource.length; i++) {
      const match = chartSource[i];
      let ratingAfter: number | null = null;

      if (i < chartSource.length - 1) {
        const nextMatch = chartSource[i + 1];
        const nextMyTeam = findMyTeam(nextMatch, pid);
        if (nextMyTeam) {
          const nextMyPlayer =
            String(nextMyTeam.player_1?.player_id) === pid
              ? nextMyTeam.player_1
              : nextMyTeam.player_2;
          ratingAfter = nextMyPlayer?.pre_match_rating ?? null;
        }
      } else {
        ratingAfter = latestRating;
      }

      if (ratingAfter === null) continue;

      // For the first point, try to derive a delta using this match's pre_match_rating
      let ratingBefore = prevRating;
      if (ratingBefore === null) {
        const myTeam = findMyTeam(match, pid);
        if (myTeam) {
          const myPlayer =
            String(myTeam.player_1?.player_id) === pid
              ? myTeam.player_1
              : myTeam.player_2;
          ratingBefore = myPlayer?.pre_match_rating ?? null;
        }
      }

      chartData.push({
        matchIndex: i + 1,
        rating: ratingAfter,
        match,
        delta: ratingBefore !== null ? ratingAfter - ratingBefore : null,
      });
      prevRating = ratingAfter;
    }

    // ── Peak rating ──────────────────────────────────────────────────────────
    const peakRating =
      chartData.length > 0
        ? Math.max(...chartData.map((p) => p.rating))
        : latestRating;

    // ── Rating delta last 5 ──────────────────────────────────────────────────
    let ratingLast5Delta: number | null = null;
    if (chartData.length >= 2 && latestRating !== null) {
      const idx = Math.max(0, chartData.length - 6);
      ratingLast5Delta = latestRating - chartData[idx].rating;
    }

    // ── Current streak ───────────────────────────────────────────────────────
    let currentStreak: { type: "W" | "L"; count: number } | null = null;
    if (completedDesc.length > 0) {
      const firstMatch = completedDesc[0];
      const firstMyTeam = findMyTeam(firstMatch, pid);
      if (firstMyTeam) {
        const streakType = didWin(firstMatch, firstMyTeam) ? "W" : "L";
        let count = 1;
        for (let i = 1; i < completedDesc.length; i++) {
          const m = completedDesc[i];
          const myTeam = findMyTeam(m, pid);
          if (!myTeam) break;
          const w = didWin(m, myTeam) ? "W" : "L";
          if (w !== streakType) break;
          count++;
        }
        if (count > 1) currentStreak = { type: streakType, count };
      }
    }

    // ── Opponent stats (per individual opponent) ─────────────────────────────
    const opponentMap = new Map<
      string,
      { player: Player; wins: number; losses: number }
    >();

    for (const m of completedDesc) {
      const myTeam = findMyTeam(m, pid);
      if (!myTeam) continue;
      const oppTeam = m.teams.find(
        (t) => t.team_number !== myTeam.team_number,
      );
      if (!oppTeam) continue;
      const won = didWin(m, myTeam);

      for (const opp of [oppTeam.player_1, oppTeam.player_2]) {
        if (!opp) continue;
        const key = String(opp.player_id);
        const entry = opponentMap.get(key) ?? {
          player: opp,
          wins: 0,
          losses: 0,
        };
        if (won) entry.wins++;
        else entry.losses++;
        opponentMap.set(key, entry);
      }
    }

    const opponentStats: OpponentStat[] = Array.from(
      opponentMap.values(),
    ).map(({ player, wins: w, losses: l }) => ({
      player,
      matchesPlayed: w + l,
      wins: w,
      losses: l,
      winRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0,
    }));

    // ── Partner stats ─────────────────────────────────────────────────────────
    const partnerMap = new Map<
      string,
      { player: Player; wins: number; losses: number }
    >();

    for (const m of completedDesc) {
      const myTeam = findMyTeam(m, pid);
      if (!myTeam) continue;
      const partner =
        String(myTeam.player_1?.player_id) === pid
          ? myTeam.player_2
          : myTeam.player_1;
      if (!partner) continue;
      const key = String(partner.player_id);
      const entry = partnerMap.get(key) ?? {
        player: partner,
        wins: 0,
        losses: 0,
      };
      if (didWin(m, myTeam)) entry.wins++;
      else entry.losses++;
      partnerMap.set(key, entry);
    }

    const partnerStats: PartnerStat[] = Array.from(partnerMap.values()).map(
      ({ player, wins: w, losses: l }) => ({
        player,
        matchesPlayed: w + l,
        wins: w,
        losses: l,
        winRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0,
      }),
    );

    return {
      totalMatches,
      wins,
      losses,
      winRate,
      peakRating,
      ratingLast5Delta,
      currentStreak,
      chartData,
      opponentStats,
      partnerStats,
    };
  }, [matches, playerId, latestRating]);
}
