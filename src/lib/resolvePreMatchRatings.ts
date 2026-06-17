import { SupabaseClient } from "@supabase/supabase-js";

// A player's pre-match rating is resolved from the player_rating_events ledger: their most recent
// rating_after, EXCLUDING the target match's own event (so we get the rating going INTO this match).
// Because the ledger mirrors match_player_ratings for match events, this is behavior-preserving for
// match-only data, and additionally picks up non-match rating events (recalibrations, adjustments).
//
// Fallback chain for players with no usable ledger row: the supplied initialRatingFallback map, then
// players.initial_rating, then null.

type InitialRatingFallback = Map<number, number | null> | null | undefined;

type LedgerRow = {
  player_id: number | string | null;
  rating_after: number | string | null;
  occurred_at: string | null;
  created_at: string | null;
  source_type: string | null;
  source_id: string | null;
};

type PlayerInitialRatingRow = {
  player_id: number | string | null;
  initial_rating: number | string | null;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Returns < 0 when `a` is more recent than `b` (descending), so it can be read as "a wins".
function compareNullableStringDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

type BestEvent = {
  ratingAfter: number;
  occurredAt: string | null;
  createdAt: string | null;
};

function isMoreRecent(candidate: LedgerRow, current: BestEvent): boolean {
  const byOccurred = compareNullableStringDesc(candidate.occurred_at, current.occurredAt);
  if (byOccurred !== 0) return byOccurred < 0;
  return compareNullableStringDesc(candidate.created_at, current.createdAt) < 0;
}

export async function resolvePreMatchRatings(
  supabase: SupabaseClient,
  matchId: number,
  playerIds: number[],
  initialRatingFallback?: InitialRatingFallback,
): Promise<Map<number, number | null>> {
  const requestedPlayerIds = Array.from(
    new Set(
      playerIds.filter((playerId) => Number.isInteger(playerId) && playerId > 0),
    ),
  );

  const resolved = new Map<number, number | null>();
  if (requestedPlayerIds.length === 0) {
    return resolved;
  }

  const { data, error } = await supabase
    .from("player_rating_events")
    .select("player_id, rating_after, occurred_at, created_at, source_type, source_id")
    .in("player_id", requestedPlayerIds);

  if (!error) {
    const best = new Map<number, BestEvent>();
    for (const row of (data ?? []) as LedgerRow[]) {
      const playerId = toFiniteNumber(row.player_id);
      const ratingAfter = toFiniteNumber(row.rating_after);
      if (playerId === null || ratingAfter === null) continue;

      // Skip the target match's own event so we resolve the rating going INTO this match.
      if (row.source_type === "match" && String(row.source_id) === String(matchId)) {
        continue;
      }

      const existing = best.get(playerId);
      if (!existing || isMoreRecent(row, existing)) {
        best.set(playerId, {
          ratingAfter,
          occurredAt: row.occurred_at,
          createdAt: row.created_at,
        });
      }
    }

    for (const [playerId, value] of best) {
      resolved.set(playerId, value.ratingAfter);
    }
  }

  // Fallback for players with no usable ledger rating yet.
  let remainingPlayerIds = requestedPlayerIds.filter(
    (playerId) => !resolved.has(playerId),
  );

  if (remainingPlayerIds.length > 0 && initialRatingFallback) {
    for (const playerId of remainingPlayerIds) {
      resolved.set(playerId, initialRatingFallback.get(playerId) ?? null);
    }
    remainingPlayerIds = requestedPlayerIds.filter(
      (playerId) => !resolved.has(playerId),
    );
  }

  if (remainingPlayerIds.length > 0 && !initialRatingFallback) {
    const { data: playersRows, error: playersError } = await supabase
      .from("players")
      .select("player_id,initial_rating")
      .in("player_id", remainingPlayerIds);

    if (!playersError) {
      for (const row of (playersRows ?? []) as PlayerInitialRatingRow[]) {
        const playerId = toFiniteNumber(row.player_id);
        if (playerId === null || resolved.has(playerId)) continue;
        resolved.set(playerId, toFiniteNumber(row.initial_rating));
      }
    }
  }

  for (const playerId of requestedPlayerIds) {
    if (!resolved.has(playerId)) {
      resolved.set(playerId, null);
    }
  }

  return resolved;
}
