import type { SupabaseClient } from "@supabase/supabase-js";
import type { LadderStanding } from "@/lib/ladder/ladderStandingTransition";

type LatestStandingRow = {
  player_id: number | string;
  tier_after_id: number;
  stars_after: number;
  cushion_available: boolean;
};

// Canonical "current standing" lookup for a set of players within a cycle: the most recent
// ladder_standing_events row per player (occurred_at desc, then created_at desc). Mirrors
// fetchLatestRatingsByPlayerIds in src/lib/ratingLedger.ts. Players with no row in this cycle
// yet are simply absent from the returned map.
export async function fetchLatestLadderStandings(
  client: SupabaseClient,
  cycleId: number,
  playerIds: Array<number | string>,
): Promise<Map<string, LadderStanding>> {
  const result = new Map<string, LadderStanding>();

  const numericIds = Array.from(
    new Set(
      playerIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
  if (numericIds.length === 0) return result;

  const { data, error } = await client
    .from("ladder_standing_events")
    .select("player_id, tier_after_id, stars_after, cushion_available")
    .eq("cycle_id", cycleId)
    .in("player_id", numericIds)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error || !data) return result;

  for (const row of data as LatestStandingRow[]) {
    const playerId = String(row.player_id);
    if (result.has(playerId)) continue;
    result.set(playerId, {
      tierId: row.tier_after_id,
      stars: row.stars_after,
      cushionAvailable: row.cushion_available,
    });
  }

  return result;
}
