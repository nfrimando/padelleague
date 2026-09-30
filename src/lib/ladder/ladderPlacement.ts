import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLatestLadderStandings } from "@/lib/ladder/ladderStandingLedger";
import { fetchTiersForCycle } from "@/lib/ladder/ladderCycleTiers";
import { fetchActiveCycle } from "@/lib/ladderData";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import type { LadderStanding } from "@/lib/ladder/ladderStandingTransition";

export type TierBucketRow = { id: number; name: string; rank: number; elo_floor: number };

// Fallback star band for degenerate tier sets (a single tier, or a zero-width one). Matches the
// 0.5 the ladder ran on while every tier was 1.5 wide.
const FALLBACK_STAR_BAND = 0.5;

// Width of a tier's rating range: up to the next tier's floor. The top tier is open-ended, so it
// borrows the width of the tier directly below it — predictable, and derived from the same floors
// the admin entered.
function tierWidth(sorted: TierBucketRow[], index: number): number {
  const next = sorted[index + 1];
  if (next) return next.elo_floor - sorted[index].elo_floor;

  const below = sorted[index - 1];
  if (below) return sorted[index].elo_floor - below.elo_floor;

  return FALLBACK_STAR_BAND * 3;
}

// Places a rating into the highest tier whose floor it clears, then splits that tier into equal
// thirds for 0★ / 1★ / 2★. Deriving the band from the tier's own width (rather than a hardcoded
// 0.5) means admin-entered thresholds of any width still divide cleanly when a cycle starts.
//
// With the 1.5-wide tiers the ladder has run on since
// 20260718000005_fix_ladder_tier_thresholds.sql, thirds are 0.5 — identical to the original
// LEAST(2, FLOOR((rating - elo_floor) / 0.5)) in the seed/backfill migrations.
export function placeByRating(
  rating: number,
  tiers: TierBucketRow[],
): { tierId: number; stars: number } | null {
  const sorted = [...tiers].sort((a, b) => a.rank - b.rank);

  let chosenIndex = -1;
  for (let i = 0; i < sorted.length; i += 1) {
    if (rating >= sorted[i].elo_floor) chosenIndex = i;
  }
  if (chosenIndex === -1) return null;

  const chosen = sorted[chosenIndex];
  const width = tierWidth(sorted, chosenIndex);
  const band = width > 0 ? width / 3 : FALLBACK_STAR_BAND;

  // Both the band and the offset are floating-point subtractions of admin-entered decimals, so a
  // rating sitting exactly on a band edge can land a hair under it (3.4 against a 3.0-3.6 tier
  // divides to 1.9999999999999991). Nudge by an epsilon before flooring so an exact boundary
  // counts as reaching the star.
  const bandsCleared = Math.floor((rating - chosen.elo_floor) / band + 1e-9);

  const stars = Math.min(2, Math.max(0, bandsCleared));
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

  // Cycle-scoped floors: a player joining mid-cycle is bucketed by the cutoffs that cycle was
  // started with, not by whatever the global ladder_tiers rows say today.
  const { tiers, error: tiersError } = await fetchTiersForCycle(supabase, cycleId);

  if (tiersError || tiers.length === 0) {
    warnings.push(tiersError || "No ladder tiers configured.");
    return { standingsByPlayer, warnings };
  }

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
