import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

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
};

export type LeaderboardEvent = {
  event_id: number;
  name: string | null;
  status: "upcoming" | "ongoing" | "completed";
};

type MatchRow = { match_id: number; winner_team: number | null; date_local: string | null };
type TeamRow = { match_id: number; team_number: number | null; player_1_id: number | null; player_2_id: number | null };
type RatingRow = { match_id: number; player_id: number | string; rating_pre: number | null; rating_post: number | null; formula_name: string | null };
type PlayerRow = { player_id: number | string; name: string | null; nickname: string | null; image_link: string | null };

function makeServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function formulaPriority(formula: string | null): number {
  const f = String(formula ?? "").toLowerCase();
  if (f === "v3") return 2;
  if (f === "v2") return 1;
  return 0;
}

export async function fetchLeaderboardEvents(): Promise<LeaderboardEvent[]> {
  const db = makeServerClient();
  const { data, error } = await db
    .from("events")
    .select("event_id, name, status")
    .order("event_id", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderboardEvent[];
}

async function fetchLeaderboardData(eventId: number | "all"): Promise<LeaderboardRow[]> {
  const db = makeServerClient();

  let matchQuery = db
    .from("matches")
    .select("match_id, winner_team, date_local")
    .eq("status", "completed")
    .order("date_local", { ascending: true });

  if (eventId !== "all") {
    matchQuery = matchQuery.eq("event_id", eventId);
  }

  const { data: matchesData, error: matchesError } = await matchQuery;
  if (matchesError) throw new Error(matchesError.message);

  const matches = (matchesData ?? []) as MatchRow[];
  if (matches.length === 0) return [];

  const matchIds = matches.map((m) => m.match_id);

  const [{ data: teamsData, error: teamsError }, { data: ratingsData, error: ratingsError }] =
    await Promise.all([
      db.from("match_teams").select("match_id, team_number, player_1_id, player_2_id").in("match_id", matchIds),
      db.from("match_player_ratings").select("match_id, player_id, rating_pre, rating_post, formula_name").in("match_id", matchIds),
    ]);

  if (teamsError) throw new Error(teamsError.message);
  if (ratingsError) throw new Error(ratingsError.message);

  const teams = (teamsData ?? []) as TeamRow[];
  const ratings = (ratingsData ?? []) as RatingRow[];

  const matchMeta: Record<number, { winner: number | null; date: string | null }> = {};
  for (const m of matches) {
    matchMeta[m.match_id] = { winner: m.winner_team, date: m.date_local };
  }

  // player_id → [{ matchId, teamNumber, date }]
  type PlayerMatchEntry = { matchId: number; teamNumber: number | null; date: string | null };
  const playerMatchMap: Record<string, PlayerMatchEntry[]> = {};

  for (const team of teams) {
    for (const rawId of [team.player_1_id, team.player_2_id]) {
      if (rawId == null) continue;
      const pid = String(rawId);
      if (!playerMatchMap[pid]) playerMatchMap[pid] = [];
      playerMatchMap[pid].push({
        matchId: team.match_id,
        teamNumber: team.team_number,
        date: matchMeta[team.match_id]?.date ?? null,
      });
    }
  }

  // player_id → { matchId → best-priority rating row }
  type BestRating = { ratingPre: number | null; ratingPost: number | null; date: string | null; priority: number };
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
  const { data: playersData, error: playersError } = await db
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
    for (const entry of matchEntries) {
      const winner = matchMeta[entry.matchId]?.winner ?? null;
      if (winner == null) continue;
      if (entry.teamNumber === winner) wins++;
      else losses++;
    }

    // Sort per-match rating entries by date ascending → first = season start, last = current
    const ratingEntries = Object.entries(playerRatingMap[pid] ?? {})
      .map(([, v]) => v)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

    const first = ratingEntries[0];
    const last = ratingEntries[ratingEntries.length - 1];
    const currentRating = last?.ratingPost ?? null;
    const seasonStartRating = first?.ratingPre ?? null;
    const ratingChange =
      currentRating != null && seasonStartRating != null ? currentRating - seasonStartRating : null;

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
    });
  }

  return rows;
}

// Completed seasons: cache forever — data will never change
const getCompletedLeaderboard = unstable_cache(
  (eventId: number) => fetchLeaderboardData(eventId),
  ["leaderboard-completed"],
  { revalidate: false },
);

// Ongoing seasons: refresh every 2 minutes
const getOngoingLeaderboard = unstable_cache(
  (eventId: number) => fetchLeaderboardData(eventId),
  ["leaderboard-ongoing"],
  { revalidate: 120 },
);

// All-time: refresh every 2 minutes
const getAllTimeLeaderboard = unstable_cache(
  () => fetchLeaderboardData("all"),
  ["leaderboard-all"],
  { revalidate: 120 },
);

export async function getLeaderboard(
  eventId: number | "all",
  eventStatus: "upcoming" | "ongoing" | "completed" | undefined,
): Promise<LeaderboardRow[]> {
  if (eventId === "all") return getAllTimeLeaderboard();
  if (eventStatus === "completed") return getCompletedLeaderboard(eventId);
  return getOngoingLeaderboard(eventId);
}
