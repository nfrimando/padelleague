import type { SupabaseClient } from "@supabase/supabase-js";

type LatestRatingRow = {
  player_id: number | string;
  rating_after: number | string | null;
};

// Canonical "current rating" lookup for a set of players: the most recent
// player_rating_events row per player (occurred_at desc, then created_at desc — the
// first row seen for a player is their latest). Works with any Supabase client
// (anon or service-role) since player_rating_events grants public SELECT. Use this
// instead of trusting a "latest_rating" field from an RPC, so every call site stays
// in sync with the ledger (including non-match events like recalibration).
export async function fetchLatestRatingsByPlayerIds(
  client: SupabaseClient,
  playerIds: Array<number | string>,
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();

  const numericIds = Array.from(
    new Set(
      playerIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
  if (numericIds.length === 0) return result;

  const { data, error } = await client
    .from("player_rating_events")
    .select("player_id, rating_after")
    .in("player_id", numericIds)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error || !data) return result;

  for (const row of data as LatestRatingRow[]) {
    const playerId = String(row.player_id);
    if (result.has(playerId)) continue;
    const rating = row.rating_after == null ? null : Number(row.rating_after);
    result.set(playerId, Number.isFinite(rating as number) ? (rating as number) : null);
  }

  return result;
}
