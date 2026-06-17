import { type AdminSupabaseClient } from "@/app/api/admin/_lib/auth";

export type LedgerEventsSummary = {
  count: number;
  players: Array<{
    player_id: number | string;
    rating_after: number | null;
    event_type: string;
  }>;
};

// Read back the player_rating_events rows the match→ledger trigger produced for a match, so admin
// endpoints can confirm the ledger is synced after writing match_player_ratings. Non-fatal: any
// read failure returns an empty summary (the trigger, not this read, is the source of truth).
export async function readLedgerEventsForMatch(
  supabase: AdminSupabaseClient,
  matchId: number,
): Promise<LedgerEventsSummary> {
  const { data, error } = await supabase
    .from("player_rating_events")
    .select("player_id, rating_after, event_type")
    .eq("source_type", "match")
    .eq("source_id", String(matchId));

  if (error || !data) {
    console.warn(
      "[ledger] failed to read player_rating_events for match",
      matchId,
      error?.message,
    );
    return { count: 0, players: [] };
  }

  return {
    count: data.length,
    players: data.map((r) => ({
      player_id: r.player_id as number | string,
      rating_after:
        r.rating_after === null || r.rating_after === undefined
          ? null
          : Number(r.rating_after),
      event_type: String(r.event_type),
    })),
  };
}
