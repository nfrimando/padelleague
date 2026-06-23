import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";

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
  setsLost: number;
};

export type LeaderboardEvent = {
  event_id: number;
  name: string | null;
  status: "upcoming" | "ongoing" | "completed";
  start_date: string | null;
  end_date: string | null;
};

type MatchRow = { match_id: number; winner_team: number | null; status: string; date_local: string | null; type: string | null };
type TeamRow = { match_id: number; team_number: number | null; player_1_id: number | null; player_2_id: number | null; sets_won: number | null };
type LedgerRatingRow = { player_id: number | string; source_id: string | null; rating_after: number | null; rating_delta: number | null };
type PlayerRow = { player_id: number | string; name: string | null; nickname: string | null; image_link: string | null };

function makeServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function fetchLeaderboardEvents(): Promise<LeaderboardEvent[]> {
  const db = makeServerClient();
  const { data, error } = await db
    .from("events")
    .select("event_id, name, status, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("event_id", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderboardEvent[];
}

async function fetchLeaderboardData(eventId: number | "ALL", matchType: string): Promise<LeaderboardRow[]> {
  const db = makeServerClient();

  let matchQuery = db
    .from("matches")
    .select("match_id, winner_team, status, date_local, type")
    .in("status", ["completed", "forfeit"])
    .order("date_local", { ascending: true });

  if (eventId !== "ALL") {
    matchQuery = matchQuery.eq("event_id", eventId);
  }

  if (matchType !== "ALL") {
    matchQuery = matchQuery.eq("type", matchType);
  }

  const { data: matchesData, error: matchesError } = await matchQuery;
  if (matchesError) throw new Error(matchesError.message);

  const matches = (matchesData ?? []) as MatchRow[];
  if (matches.length === 0) return [];

  const matchIds = matches.map((m) => m.match_id);

  const [{ data: teamsData, error: teamsError }, { data: ratingsData, error: ratingsError }] =
    await Promise.all([
      db.from("match_teams").select("match_id, team_number, player_1_id, player_2_id, sets_won").in("match_id", matchIds),
      db
        .from("player_rating_events")
        .select("player_id, source_id, rating_after, rating_delta")
        .eq("source_type", "match")
        .in("source_id", matchIds.map(String)),
    ]);

  if (teamsError) throw new Error(teamsError.message);
  if (ratingsError) throw new Error(ratingsError.message);

  const teams = (teamsData ?? []) as TeamRow[];
  const ratings = (ratingsData ?? []) as LedgerRatingRow[];

  const teamSetsByMatch: Record<number, Partial<Record<number, number | null>>> = {};
  for (const team of teams) {
    if (team.team_number == null) continue;
    if (!teamSetsByMatch[team.match_id]) {
      teamSetsByMatch[team.match_id] = {};
    }
    teamSetsByMatch[team.match_id][team.team_number] = team.sets_won;
  }

  const matchMeta: Record<number, { winner: number | null; status: string; date: string | null }> = {};
  for (const m of matches) {
    matchMeta[m.match_id] = { winner: m.winner_team, status: m.status, date: m.date_local };
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

  // player_id → { matchId → ledger rating entry }. The ledger already holds exactly one row per
  // (player, match) at the best formula priority, so no dedup is needed here.
  type RatingEntry = { matchId: number; ratingAfter: number | null; ratingDelta: number | null; date: string | null };
  const playerRatingMap: Record<string, Record<number, RatingEntry>> = {};

  for (const r of ratings) {
    if (r.source_id == null) continue;
    const matchId = Number(r.source_id);
    if (!Number.isFinite(matchId)) continue;
    const pid = String(r.player_id);
    if (!playerRatingMap[pid]) playerRatingMap[pid] = {};
    playerRatingMap[pid][matchId] = {
      matchId,
      ratingAfter: r.rating_after,
      ratingDelta: r.rating_delta,
      date: matchMeta[matchId]?.date ?? null,
    };
  }

  const allPlayerIds = Object.keys(playerMatchMap);
  if (allPlayerIds.length === 0) return [];

  const numericIds = allPlayerIds.map(Number).filter((n) => Number.isFinite(n) && n > 0);

  // currentRating must reflect the player's true latest rating (which may come from a
  // non-match ledger event like a recalibration), not just their rating as of the last
  // match counted in this filtered set. ratingChange/wins/losses/sets stay scoped to the
  // filtered match set below — only currentRating uses this unscoped lookup.
  const [{ data: playersData, error: playersError }, latestRatingByPlayer] = await Promise.all([
    db
      .from("players")
      .select("player_id, name, nickname, image_link")
      .in("player_id", numericIds),
    fetchLatestRatingsByPlayerIds(db, numericIds),
  ]);

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
    let setsLost = 0;
    for (const entry of matchEntries) {
      const winner = matchMeta[entry.matchId]?.winner ?? null;
      if (winner == null) continue;
      if (entry.teamNumber === winner) wins++;
      else losses++;

      const ownTeamNumber = entry.teamNumber;
      if (ownTeamNumber == null) continue;

      if (matchMeta[entry.matchId]?.status === "forfeit") {
        // Forfeit: winning team gets 2 sets won, losing team gets 2 sets lost
        if (entry.teamNumber === winner) {
          setsWon += 2;
        } else {
          setsLost += 2;
        }
      } else {
        const ownSets = teamSetsByMatch[entry.matchId]?.[ownTeamNumber] ?? null;
        const opponentTeamNumber = ownTeamNumber === 1 ? 2 : ownTeamNumber === 2 ? 1 : null;
        const opponentSets =
          opponentTeamNumber == null
            ? null
            : (teamSetsByMatch[entry.matchId]?.[opponentTeamNumber] ?? null);

        if (ownSets != null) setsWon += ownSets;
        if (opponentSets != null) setsLost += opponentSets;
      }
    }

    // Sorted ascending by date (then matchId) so ratingChange sums deltas in chronological
    // order; currentRating itself comes from latestRatingByPlayer above, not from this list.
    const ratingEntries = Object.values(playerRatingMap[pid] ?? {}).sort((a, b) => {
      const byDate = (a.date ?? "").localeCompare(b.date ?? "");
      return byDate !== 0 ? byDate : a.matchId - b.matchId;
    });

    const currentRating = latestRatingByPlayer.get(pid) ?? null;
    const hasIncompleteRatingEntry = ratingEntries.some(
      (entry) => entry.ratingAfter == null || entry.ratingDelta == null,
    );
    const ratingChange = hasIncompleteRatingEntry
      ? null
      : ratingEntries.reduce((total, entry) => total + (entry.ratingDelta ?? 0), 0);

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
      setsLost,
    });
  }

  return rows;
}

// Event-specific leaderboard: refresh every 2 minutes
const getEventLeaderboard = unstable_cache(
  (eventId: number, matchType: string) => fetchLeaderboardData(eventId, matchType),
  ["leaderboard-event"],
  { revalidate: 120 },
);

// All-time: refresh every 2 minutes
const getAllTimeLeaderboard = unstable_cache(
  (matchType: string) => fetchLeaderboardData("ALL", matchType),
  ["leaderboard-all"],
  { revalidate: 120 },
);

export async function getLeaderboard(
  eventId: number | "ALL",
  matchType: string,
): Promise<LeaderboardRow[]> {
  if (eventId === "ALL") return getAllTimeLeaderboard(matchType);
  return getEventLeaderboard(eventId, matchType);
}
