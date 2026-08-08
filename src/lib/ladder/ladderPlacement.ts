import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLatestLadderStandings } from "@/lib/ladder/ladderStandingLedger";
import { fetchActiveCycle } from "@/lib/ladderData";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import type { LadderStanding } from "@/lib/ladder/ladderStandingTransition";

export type TierBucketRow = { id: number; name: string; rank: number; elo_floor: number };

// Same bucketing as supabase/migrations/20260718000006_seed_ladder_cycle_1.sql:
// LEAST(2, FLOOR((rating - elo_floor) / 0.5)), placed into the highest tier whose floor the
// rating clears.
export function placeByRating(
  rating: number,
  tiers: TierBucketRow[],
): { tierId: number; stars: number } | null {
  const sorted = [...tiers].sort((a, b) => a.rank - b.rank);
  let chosen: TierBucketRow | null = null;
  for (const tier of sorted) {
    if (rating >= tier.elo_floor) chosen = tier;
  }
  if (!chosen) return null;

  const stars = Math.min(2, Math.max(0, Math.floor((rating - chosen.elo_floor) / 0.5)));
  return { tierId: chosen.id, stars };
}

export type EnsureLadderPlacementResult = {
  standingsByPlayer: Map<string, LadderStanding>;
  warnings: string[];
};

// Places any of `playerIds` who don't yet have a ladder_standing_events row in `cycleId` into
// their starting tier/stars, using their current resolvable rating (player_rating_events
// ledger). Writes a real cycle_start / source_type='cycle_seed' row per player placed. Players
// with no resolvable rating are skipped (nothing to place them by) and reported in `warnings`.
// This is the shared placement path used at match-completion time (a seated player who's never
// been placed), on ladder opt-in (a player who hasn't played yet), and by one-off backfills.
export async function ensureLadderPlacement(
  supabase: SupabaseClient,
  cycleId: number,
  playerIds: number[],
  occurredAt: string = new Date().toISOString(),
): Promise<EnsureLadderPlacementResult> {
  const warnings: string[] = [];
  const uniquePlayerIds = Array.from(new Set(playerIds));

  const standingsByPlayer = await fetchLatestLadderStandings(supabase, cycleId, uniquePlayerIds);

  const missingPlayerIds = uniquePlayerIds.filter(
    (id) => !standingsByPlayer.has(String(id)),
  );
  if (missingPlayerIds.length === 0) {
    return { standingsByPlayer, warnings };
  }

  const { data: tiersData, error: tiersError } = await supabase
    .from("ladder_tiers")
    .select("id, name, rank, elo_floor");

  if (tiersError || !tiersData || tiersData.length === 0) {
    warnings.push(tiersError?.message || "No ladder tiers configured.");
    return { standingsByPlayer, warnings };
  }

  const tiers = tiersData as TierBucketRow[];
  const ratingsByPlayer = await fetchLatestRatingsByPlayerIds(supabase, missingPlayerIds);

  for (const playerId of missingPlayerIds) {
    const rating = ratingsByPlayer.get(String(playerId));
    if (rating === undefined || rating === null) {
      warnings.push(`Player ${playerId} has no resolvable rating; skipped for this cycle.`);
      continue;
    }

    const placement = placeByRating(rating, tiers);
    if (!placement) {
      warnings.push(`Player ${playerId} could not be placed into a tier; skipped.`);
      continue;
    }

    const { error: seedError } = await supabase.from("ladder_standing_events").insert({
      cycle_id: cycleId,
      player_id: playerId,
      event_type: "cycle_start",
      tier_before_id: null,
      tier_after_id: placement.tierId,
      stars_before: null,
      stars_after: placement.stars,
      cushion_available: true,
      source_type: "cycle_seed",
      source_id: null,
      occurred_at: occurredAt,
      metadata: { seed_rating: rating },
    });

    if (seedError) {
      warnings.push(`Failed to place player ${playerId} into the ladder: ${seedError.message}`);
      continue;
    }

    standingsByPlayer.set(String(playerId), {
      tierId: placement.tierId,
      stars: placement.stars,
      cushionAvailable: true,
    });
  }

  return { standingsByPlayer, warnings };
}

// Places a single player into the active cycle if they don't have a standing row yet. Used by
// the player-creation paths (recruit approval, admin create) so a new member's rung exists from
// day one, and by the ladder opt-in path. Deliberately does NOT touch `is_ladder_opt_in` —
// placement is not enrollment; the roulette pool still filters on opt-in.
//
// Never throws: a ladder problem must not fail the approval/profile update that called it. The
// caller logs the returned warnings and may surface them as a non-fatal `ladderWarning`.
export async function placePlayerInActiveCycle(
  supabase: SupabaseClient,
  playerId: number,
): Promise<{ placed: boolean; warnings: string[] }> {
  try {
    const activeCycle = await fetchActiveCycle(supabase);
    if (!activeCycle) {
      return { placed: false, warnings: ["No active ladder cycle; player not placed."] };
    }

    const { standingsByPlayer, warnings } = await ensureLadderPlacement(
      supabase,
      activeCycle.id,
      [playerId],
    );

    return { placed: standingsByPlayer.has(String(playerId)), warnings };
  } catch (err) {
    return {
      placed: false,
      warnings: [err instanceof Error ? err.message : "Ladder placement failed."],
    };
  }
}
