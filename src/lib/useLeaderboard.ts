"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type LeaderboardRow = {
  playerId: string;
  name: string;
  nickname: string;
  imageLink: string | null;
  currentRating: number | null;
  ratingChange: number | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  setsWon: number;
};

export type LeaderboardEvent = {
  event_id: number;
  name: string | null;
  status: "upcoming" | "ongoing" | "completed";
};

export const MATCH_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "duel", label: "Duel" },
  { value: "group", label: "Group" },
  { value: "kotc", label: "KOTC" },
  { value: "finals", label: "Finals" },
] as const;

export type MatchTypeFilter = (typeof MATCH_TYPE_OPTIONS)[number]["value"];

// ─── Module-level cache for completed events (never re-fetched) ───────────────

const completedCache = new Map<string, LeaderboardRow[]>();
const inFlightCache = new Map<string, Promise<LeaderboardRow[]>>();

let cachedEvents: LeaderboardEvent[] | null = null;
let eventsInFlight: Promise<LeaderboardEvent[]> | null = null;

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchRow = { match_id: number; winner_team: number | null; date_local: string | null };
type TeamRow = {
  match_id: number;
  team_number: number | null;
  sets_won: number | null;
  player_1_id: number | null;
  player_2_id: number | null;
};
type RatingRow = {
  match_id: number;
  player_id: number | string;
  rating_pre: number | null;
  rating_post: number | null;
  formula_name: string | null;
};
type PlayerRow = {
  player_id: number | string;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

function formulaPriority(formula: string | null): number {
  const f = String(formula ?? "").toLowerCase();
  if (f === "v3") return 2;
  if (f === "v2") return 1;
  return 0;
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

async function fetchLeaderboardRows(
  eventId: number | "all",
  matchType: MatchTypeFilter,
): Promise<LeaderboardRow[]> {
  let matchQuery = supabase
    .from("matches")
    .select("match_id, winner_team, date_local")
    .eq("status", "completed")
    .order("date_local", { ascending: true });

  if (eventId !== "all") matchQuery = matchQuery.eq("event_id", eventId);
  if (matchType !== "all") matchQuery = matchQuery.eq("type", matchType);

  const { data: matchesData, error: matchesError } = await matchQuery;
  if (matchesError) throw new Error(matchesError.message);

  const matches = (matchesData ?? []) as MatchRow[];
  if (matches.length === 0) return [];

  const matchIds = matches.map((m) => m.match_id);

  const [{ data: teamsData, error: teamsError }, { data: ratingsData, error: ratingsError }] =
    await Promise.all([
      supabase
        .from("match_teams")
        .select("match_id, team_number, sets_won, player_1_id, player_2_id")
        .in("match_id", matchIds),
      supabase
        .from("match_player_ratings")
        .select("match_id, player_id, rating_pre, rating_post, formula_name")
        .in("match_id", matchIds),
    ]);

  if (teamsError) throw new Error(teamsError.message);
  if (ratingsError) throw new Error(ratingsError.message);

  const teams = (teamsData ?? []) as TeamRow[];
  const ratings = (ratingsData ?? []) as RatingRow[];

  const matchMeta: Record<number, { winner: number | null; date: string | null }> = {};
  for (const m of matches) {
    matchMeta[m.match_id] = { winner: m.winner_team, date: m.date_local };
  }

  type PlayerMatchEntry = {
    matchId: number;
    teamNumber: number | null;
    setsWon: number;
    date: string | null;
  };
  const playerMatchMap: Record<string, PlayerMatchEntry[]> = {};

  for (const team of teams) {
    for (const rawId of [team.player_1_id, team.player_2_id]) {
      if (rawId == null) continue;
      const pid = String(rawId);
      if (!playerMatchMap[pid]) playerMatchMap[pid] = [];
      playerMatchMap[pid].push({
        matchId: team.match_id,
        teamNumber: team.team_number,
        setsWon: team.sets_won ?? 0,
        date: matchMeta[team.match_id]?.date ?? null,
      });
    }
  }

  type BestRating = {
    ratingPre: number | null;
    ratingPost: number | null;
    date: string | null;
    priority: number;
  };
  const playerRatingMap: Record<string, Record<number, BestRating>> = {};

  for (const r of ratings) {
    const pid = String(r.player_id);
    const priority = formulaPriority(r.formula_name);
    if (!playerRatingMap[pid]) playerRatingMap[pid] = {};
    const existing = playerRatingMap[pid][r.match_id];
    if (!existing || priority > existing.priority) {
      playerRatingMap[pid][r.match_id] = {
        ratingPre: r.rating_pre,
        ratingPost: r.rating_post,
        date: matchMeta[r.match_id]?.date ?? null,
        priority,
      };
    }
  }

  const allPlayerIds = Object.keys(playerMatchMap);
  if (allPlayerIds.length === 0) return [];

  const numericIds = allPlayerIds.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("player_id, name, nickname, image_link")
    .in("player_id", numericIds);

  if (playersError) throw new Error(playersError.message);

  const playerInfoMap: Record<string, PlayerRow> = {};
  for (const p of (playersData ?? []) as PlayerRow[]) {
    playerInfoMap[String(p.player_id)] = p;
  }

  const rows: LeaderboardRow[] = [];

  for (const pid of allPlayerIds) {
    const info = playerInfoMap[pid];
    if (!info) continue;

    const matchEntries = playerMatchMap[pid] ?? [];
    let wins = 0;
    let losses = 0;
    let setsWon = 0;

    for (const entry of matchEntries) {
      const winner = matchMeta[entry.matchId]?.winner ?? null;
      setsWon += entry.setsWon;
      if (winner == null) continue;
      if (entry.teamNumber === winner) wins++;
      else losses++;
    }

    const ratingEntries = Object.values(playerRatingMap[pid] ?? {}).sort((a, b) =>
      (a.date ?? "").localeCompare(b.date ?? ""),
    );

    const first = ratingEntries[0];
    const last = ratingEntries[ratingEntries.length - 1];
    const currentRating = last?.ratingPost ?? null;
    const seasonStartRating = first?.ratingPre ?? null;
    const ratingChange =
      currentRating != null && seasonStartRating != null
        ? currentRating - seasonStartRating
        : null;

    rows.push({
      playerId: pid,
      name: String(info.name ?? "Unknown"),
      nickname: String(info.nickname ?? ""),
      imageLink: info.image_link ?? null,
      currentRating,
      ratingChange,
      matchesPlayed: matchEntries.length,
      wins,
      losses,
      setsWon,
    });
  }

  return rows;
}

// Completed events: cache in module-level Map (same pattern as useEventMap)
function getCachedOrFetch(
  cacheKey: string,
  isCompleted: boolean,
  eventId: number | "all",
  matchType: MatchTypeFilter,
): Promise<LeaderboardRow[]> {
  if (isCompleted) {
    const cached = completedCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inFlightCache.get(cacheKey);
  if (existing) return existing;

  const promise = fetchLeaderboardRows(eventId, matchType).then((rows) => {
    if (isCompleted) completedCache.set(cacheKey, rows);
    inFlightCache.delete(cacheKey);
    return rows;
  });

  inFlightCache.set(cacheKey, promise);
  return promise;
}

// ─── Events hook ─────────────────────────────────────────────────────────────

async function loadEvents(): Promise<LeaderboardEvent[]> {
  if (cachedEvents) return cachedEvents;
  if (!eventsInFlight) {
    eventsInFlight = (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("event_id, name, status")
        .order("event_id", { ascending: false });
      if (error) throw new Error(error.message);
      cachedEvents = (data ?? []) as LeaderboardEvent[];
      eventsInFlight = null;
      return cachedEvents;
    })();
  }
  return eventsInFlight!;
}

export function useLeaderboardEvents() {
  const [events, setEvents] = useState<LeaderboardEvent[]>(cachedEvents ?? []);
  const [loading, setLoading] = useState(!cachedEvents);

  useEffect(() => {
    let cancelled = false;
    if (cachedEvents) {
      setEvents(cachedEvents);
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadEvents().then((evs) => {
      if (!cancelled) {
        setEvents(evs);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { events, loading };
}

// ─── Leaderboard hook ─────────────────────────────────────────────────────────

export function useLeaderboard(
  eventId: number | "all",
  eventStatus: "upcoming" | "ongoing" | "completed" | undefined,
  matchType: MatchTypeFilter,
) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = useMemo(() => `${eventId}:${matchType}`, [eventId, matchType]);
  const isCompleted = eventStatus === "completed";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getCachedOrFetch(cacheKey, isCompleted, eventId, matchType)
      .then((result) => {
        if (!cancelled) {
          setRows(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load leaderboard.");
          setRows([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, isCompleted, eventId, matchType]);

  return { rows, loading, error };
}
