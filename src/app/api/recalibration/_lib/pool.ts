import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import type { AnchorPoolPlayer } from "@/lib/recalibration/survey";

// A player needs at least this many recorded matches for their rating to be a
// reliable comparison anchor (provisional ratings make noisy anchors).
export const MIN_MATCHES_FOR_ANCHOR = 5;
// If too few players clear that bar (small/young league), fall back to every rated
// player so the survey still has enough opponents to bracket a rating.
const FALLBACK_POOL_SIZE = 8;

type PlayerRow = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

/**
 * Build the opponent pool for a recalibration survey: verified (active) players who
 * have a ledger rating, excluding the calibratee. Preferred anchors are "established"
 * (>= MIN_MATCHES_FOR_ANCHOR match events); if too few qualify we fall back to all
 * rated players. Returned sorted ascending by rating. Ratings are included for the
 * server's selection logic and must NOT be forwarded to the responding player.
 */
export async function buildAnchorPool(
  serviceClient: SupabaseClient,
  calibrateePlayerId: number,
): Promise<AnchorPoolPlayer[]> {
  const { data: playerRows } = await serviceClient
    .from("players")
    .select("player_id, name, nickname, image_link")
    .eq("is_profile_complete", true)
    .neq("player_id", calibrateePlayerId);

  const players = (playerRows ?? []) as PlayerRow[];
  if (players.length === 0) return [];

  const ids = players.map((p) => p.player_id);

  const [ratingByPlayer, matchCountByPlayer] = await Promise.all([
    fetchLatestRatingsByPlayerIds(serviceClient, ids),
    fetchMatchCounts(serviceClient, ids),
  ]);

  const rated = players
    .map((p) => ({
      player_id: p.player_id,
      name: p.name ?? null,
      nickname: p.nickname ?? null,
      image_link: p.image_link ?? null,
      rating: ratingByPlayer.get(String(p.player_id)) ?? null,
      matchCount: matchCountByPlayer.get(String(p.player_id)) ?? 0,
    }))
    .filter((p): p is typeof p & { rating: number } => p.rating != null);

  const established = rated.filter((p) => p.matchCount >= MIN_MATCHES_FOR_ANCHOR);
  const chosen = established.length >= FALLBACK_POOL_SIZE ? established : rated;

  return chosen
    .map(({ player_id, name, nickname, image_link, rating }) => ({
      player_id,
      name,
      nickname,
      image_link,
      rating,
    }))
    .sort((a, b) => a.rating - b.rating);
}

/** Count match_win/match_loss ledger events per player. */
async function fetchMatchCounts(
  client: SupabaseClient,
  playerIds: number[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (playerIds.length === 0) return counts;

  const { data } = await client
    .from("player_rating_events")
    .select("player_id")
    .in("player_id", playerIds)
    .in("event_type", ["match_win", "match_loss"]);

  for (const row of (data ?? []) as Array<{ player_id: number | string }>) {
    const key = String(row.player_id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
