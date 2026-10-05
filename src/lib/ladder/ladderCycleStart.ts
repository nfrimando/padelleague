import type { AdminSupabaseClient } from "@/app/api/admin/_lib/auth";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import { placeByRating, type TierBucketRow } from "@/lib/ladder/ladderPlacement";
import { isDuoLadderAvailable } from "@/lib/ladder/ladderSchema";
import {
  computeDuoCyclePlacements,
  writeDuoCyclePlacements,
  type DuoPlacementDraft,
} from "@/lib/ladder/ladderDuoCycle";

export type LadderCycleThresholdInput = { tierId: number; eloFloor: number };

export type LadderPlacementDraft = {
  player_id: number;
  rating: number;
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  stars: number;
  // Where this player finished the previous cycle, for the admin preview's before -> after.
  // Null when they held no standing there (or when there is no previous cycle).
  previous_tier_id: number | null;
  previous_tier_name: string | null;
  previous_stars: number | null;
};

export type LadderTierDistribution = {
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  elo_floor: number;
  star_band: number;
  count: number;
};

export type StartLadderCycleOptions = {
  label: string;
  startsAt?: string;
  thresholds: LadderCycleThresholdInput[];
  // Duo ladder floors. Same validation as `thresholds`. When omitted (and the duo ladder is
  // enabled) the solo floors are used.
  duoThresholds?: LadderCycleThresholdInput[];
  dryRun?: boolean;
};

export type StartLadderCycleResult =
  | {
      ok: true;
      cycle: { id: number | null; label: string; status: string; starts_at: string };
      placements: LadderPlacementDraft[];
      namesByPlayer: Record<string, string>;
      distribution: LadderTierDistribution[];
      previousCycle: { id: number; label: string } | null;
      // Duo ladder allocation. duoAvailable is false until the duo migrations are applied, in which
      // case the duo fields are empty and nothing duo-related is written.
      duoAvailable: boolean;
      duoPlacements: DuoPlacementDraft[];
      duoLabels: Record<string, string>;
      duoDistribution: LadderTierDistribution[];
      written: boolean;
      warnings: string[];
    }
  | { ok: false; error: string };

// Mirrors tierWidth in ladderPlacement.ts so the admin preview can show the star band each
// threshold produces. Kept here rather than exported from there to avoid widening that module's
// surface for a display-only concern.
export function starBandForIndex(sorted: TierBucketRow[], index: number): number {
  const next = sorted[index + 1];
  if (next) return (next.elo_floor - sorted[index].elo_floor) / 3;
  const below = sorted[index - 1];
  if (below) return (sorted[index].elo_floor - below.elo_floor) / 3;
  return 0.5;
}

export type TierIdentityRow = { id: number; name: string; rank: number };

// Validates the submitted floors against the real tier set and returns tiers carrying them.
export function applyThresholds(
  tierRows: TierIdentityRow[],
  thresholds: LadderCycleThresholdInput[],
): { tiers: TierBucketRow[] } | { error: string } {
  if (tierRows.length === 0) return { error: "No ladder tiers configured." };

  const byTierId = new Map<string, number>();
  for (const t of thresholds) {
    if (!Number.isFinite(t.eloFloor) || t.eloFloor < 0) {
      return { error: `Threshold for tier ${t.tierId} must be a number of 0 or more.` };
    }
    if (byTierId.has(String(t.tierId))) {
      return { error: `Tier ${t.tierId} was given more than one threshold.` };
    }
    byTierId.set(String(t.tierId), t.eloFloor);
  }

  if (byTierId.size !== tierRows.length) {
    return {
      error: `Expected one threshold per tier (${tierRows.length}), received ${byTierId.size}.`,
    };
  }

  const tiers: TierBucketRow[] = [];
  for (const row of tierRows) {
    const floor = byTierId.get(String(row.id));
    if (floor === undefined) return { error: `Missing a threshold for ${row.name}.` };
    tiers.push({ id: row.id, name: row.name, rank: row.rank, elo_floor: floor });
  }

  tiers.sort((a, b) => a.rank - b.rank);

  // The lowest tier must start at 0, or a low-rated player clears no floor and cannot be placed.
  if (tiers[0].elo_floor !== 0) {
    return {
      error: `The lowest tier (${tiers[0].name}) must have a threshold of 0 so every rating can be placed.`,
    };
  }

  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i].elo_floor <= tiers[i - 1].elo_floor) {
      return {
        error: `Thresholds must increase with tier: ${tiers[i].name} (${tiers[i].elo_floor}) must be above ${tiers[i - 1].name} (${tiers[i - 1].elo_floor}).`,
      };
    }
  }

  return { tiers };
}

type PreviousStandingRow = {
  player_id: number | string;
  tier_after_id: number;
  stars_after: number;
  occurred_at: string | null;
  created_at: string;
};

// Starts the next ladder cycle: takes an admin-entered rating floor per tier, allocates every
// rated player into a tier and star count from their current rating, and seeds the ledger.
//
// Allocation is pure threshold placement -- last cycle's tier is not carried over and nobody is
// force-dropped. `dryRun` computes the whole allocation without writing, so the admin reviews the
// distribution and each player's before -> after first.
//
// Requires no cycle to be active: closing (closeLadderCycle) is a separate, already-irreversible
// action and the two are deliberately not bundled.
//
// Write order matters. The cycle is created as 'upcoming', the thresholds and every placement row
// are written, and only then is it flipped to 'active' -- the step that arms the
// ladder_cycles_uniq_active index and makes the cycle visible to the roulette, match creation and
// /ladder. A failure partway therefore leaves an inert 'upcoming' row rather than a half-placed
// live cycle (fetchActiveCycle deliberately never falls back to 'upcoming').
export async function startLadderCycle(
  supabase: AdminSupabaseClient,
  options: StartLadderCycleOptions,
): Promise<StartLadderCycleResult> {
  const { thresholds, dryRun = false } = options;
  const warnings: string[] = [];

  const label = options.label.trim();
  if (!label) return { ok: false, error: "A cycle label is required." };

  const startsAt = options.startsAt ?? new Date().toISOString();
  if (Number.isNaN(new Date(startsAt).getTime())) {
    return { ok: false, error: "Start date is not a valid date." };
  }

  // ---- Guard: nothing may be active ----------------------------------------------------------
  const { data: activeRow, error: activeError } = await supabase
    .from("ladder_cycles")
    .select("id, label")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (activeError) {
    return { ok: false, error: `Failed to check for an active cycle: ${activeError.message}` };
  }
  if (activeRow) {
    return {
      ok: false,
      error: `"${activeRow.label}" is still active. Close it first — a cycle's results are frozen at close, so starting the next one on top of it would lose them.`,
    };
  }

  // ---- Tiers + thresholds --------------------------------------------------------------------
  const { data: tiersData, error: tiersError } = await supabase
    .from("ladder_tiers")
    .select("id, name, rank")
    .order("rank", { ascending: true });

  if (tiersError) return { ok: false, error: `Failed to load tiers: ${tiersError.message}` };

  const applied = applyThresholds((tiersData ?? []) as TierIdentityRow[], thresholds);
  if ("error" in applied) return { ok: false, error: applied.error };
  const { tiers } = applied;

  const duoAvailable = await isDuoLadderAvailable(supabase);
  let duoTiers: TierBucketRow[] = [];
  if (duoAvailable) {
    if (options.duoThresholds && options.duoThresholds.length > 0) {
      const duoApplied = applyThresholds((tiersData ?? []) as TierIdentityRow[], options.duoThresholds);
      if ("error" in duoApplied) return { ok: false, error: `Duo floors: ${duoApplied.error}` };
      duoTiers = duoApplied.tiers;
    } else {
      duoTiers = tiers;
      warnings.push("No duo floors were given, so the duo ladder uses the solo floors this cycle.");
    }
  }

  // ---- Previous cycle, for the before -> after column -----------------------------------------
  const { data: previousCycleRow, error: previousCycleError } = await supabase
    .from("ladder_cycles")
    .select("id, label")
    .eq("status", "completed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousCycleError) {
    return { ok: false, error: `Failed to load the previous cycle: ${previousCycleError.message}` };
  }

  const previousCycle = previousCycleRow
    ? { id: previousCycleRow.id as number, label: previousCycleRow.label as string }
    : null;

  const previousStandings = new Map<string, { tierId: number; stars: number }>();
  if (previousCycle) {
    // Same single-query-then-reduce as closeLadderCycle: first row seen per player is their last.
    const { data: standingRows, error: standingsError } = await supabase
      .from("ladder_standing_events")
      .select("player_id, tier_after_id, stars_after, occurred_at, created_at")
      .eq("cycle_id", previousCycle.id)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (standingsError) {
      return {
        ok: false,
        error: `Failed to load the previous cycle's standings: ${standingsError.message}`,
      };
    }

    for (const row of (standingRows ?? []) as PreviousStandingRow[]) {
      const key = String(row.player_id);
      if (previousStandings.has(key)) continue;
      previousStandings.set(key, { tierId: row.tier_after_id, stars: row.stars_after });
    }
  }

  // ---- Allocate every rated player -----------------------------------------------------------
  // Same player set as 20260808000000_backfill_ladder_placement_all_players.sql: everyone with a
  // resolvable rating, regardless of is_ladder_opt_in. Placement is not enrollment — the roulette
  // pool still filters on opt-in — so everyone has a rung waiting from day one of the cycle.
  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("player_id, name");

  if (playersError) return { ok: false, error: `Failed to load players: ${playersError.message}` };

  const playerRows = (playersData ?? []) as Array<{ player_id: number | string; name: string | null }>;
  if (playerRows.length === 0) return { ok: false, error: "No players to place." };

  const namesByPlayer = new Map<string, string>();
  for (const p of playerRows) namesByPlayer.set(String(p.player_id), p.name ?? "");

  const playerIds = playerRows.map((p) => Number(p.player_id));
  const ratingsByPlayer = await fetchLatestRatingsByPlayerIds(supabase, playerIds);

  const tierById = new Map<number, TierBucketRow>();
  for (const tier of tiers) tierById.set(tier.id, tier);

  const placements: LadderPlacementDraft[] = [];
  let unratedCount = 0;
  let unplaceableCount = 0;

  for (const playerId of playerIds) {
    const key = String(playerId);
    const rating = ratingsByPlayer.get(key);

    if (rating === undefined || rating === null) {
      unratedCount += 1;
      continue;
    }

    const placement = placeByRating(rating, tiers);
    if (!placement) {
      unplaceableCount += 1;
      continue;
    }

    const tier = tierById.get(placement.tierId);
    if (!tier) continue;

    const previous = previousStandings.get(key) ?? null;

    placements.push({
      player_id: playerId,
      rating,
      tier_id: tier.id,
      tier_name: tier.name,
      tier_rank: tier.rank,
      stars: placement.stars,
      previous_tier_id: previous?.tierId ?? null,
      previous_tier_name: previous ? (tierById.get(previous.tierId)?.name ?? null) : null,
      previous_stars: previous?.stars ?? null,
    });
  }

  if (unratedCount > 0) {
    warnings.push(
      `${unratedCount} player(s) have no rating yet and were not placed. They'll be placed automatically on their first ladder match or when they opt in.`,
    );
  }
  if (unplaceableCount > 0) {
    warnings.push(`${unplaceableCount} player(s) fell below every tier floor and were skipped.`);
  }
  if (placements.length === 0) {
    return { ok: false, error: "No player could be placed with these thresholds." };
  }

  const countByTier = new Map<number, number>();
  for (const p of placements) countByTier.set(p.tier_id, (countByTier.get(p.tier_id) ?? 0) + 1);

  const distribution: LadderTierDistribution[] = tiers.map((tier, index) => ({
    tier_id: tier.id,
    tier_name: tier.name,
    tier_rank: tier.rank,
    elo_floor: tier.elo_floor,
    star_band: starBandForIndex(tiers, index),
    count: countByTier.get(tier.id) ?? 0,
  }));

  // ---- Duo allocation ------------------------------------------------------------------------
  let duoPlacements: DuoPlacementDraft[] = [];
  let duoLabels: Record<string, string> = {};
  let duoDistribution: LadderTierDistribution[] = [];
  if (duoAvailable) {
    const duoResult = await computeDuoCyclePlacements(supabase, duoTiers, previousCycle?.id ?? null);
    if (!duoResult.ok) return { ok: false, error: duoResult.error };
    duoPlacements = duoResult.placements;
    duoLabels = duoResult.labels;
    warnings.push(...duoResult.warnings);

    const duoCountByTier = new Map<number, number>();
    for (const p of duoPlacements) duoCountByTier.set(p.tier_id, (duoCountByTier.get(p.tier_id) ?? 0) + 1);
    duoDistribution = duoTiers.map((tier, index) => ({
      tier_id: tier.id,
      tier_name: tier.name,
      tier_rank: tier.rank,
      elo_floor: tier.elo_floor,
      star_band: starBandForIndex(duoTiers, index),
      count: duoCountByTier.get(tier.id) ?? 0,
    }));
  }

  if (dryRun) {
    return {
      ok: true,
      cycle: { id: null, label, status: "upcoming", starts_at: startsAt },
      placements,
      namesByPlayer: Object.fromEntries(namesByPlayer),
      distribution,
      previousCycle,
      duoAvailable,
      duoPlacements,
      duoLabels,
      duoDistribution,
      written: false,
      warnings,
    };
  }

  // ---- Write ---------------------------------------------------------------------------------
  const { data: createdCycle, error: createError } = await supabase
    .from("ladder_cycles")
    .insert({ label, status: "upcoming", starts_at: startsAt })
    .select("id, label, status, starts_at")
    .single();

  if (createError || !createdCycle) {
    return { ok: false, error: `Failed to create the cycle: ${createError?.message ?? "unknown error"}` };
  }

  const cycleId = createdCycle.id as number;
  const halfBuilt = `Cycle #${cycleId} was created but is not active, so nothing reads it. Delete it and try again.`;

  const { error: thresholdError } = await supabase.from("ladder_cycle_tiers").insert(
    tiers.map((tier) => ({ cycle_id: cycleId, tier_id: tier.id, elo_floor: tier.elo_floor })),
  );

  if (thresholdError) {
    return { ok: false, error: `Failed to save the thresholds: ${thresholdError.message} ${halfBuilt}` };
  }

  if (duoAvailable) {
    const { error: duoThresholdError } = await supabase.from("ladder_cycle_duo_tiers").insert(
      duoTiers.map((tier) => ({ cycle_id: cycleId, tier_id: tier.id, elo_floor: tier.elo_floor })),
    );
    if (duoThresholdError) {
      return { ok: false, error: `Failed to save the duo floors: ${duoThresholdError.message} ${halfBuilt}` };
    }
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < placements.length; i += CHUNK_SIZE) {
    const chunk = placements.slice(i, i + CHUNK_SIZE).map((p) => ({
      cycle_id: cycleId,
      player_id: p.player_id,
      // Stays 'cycle_start' rather than 'cycle_reset' so the uniq_lse_cycle_start partial unique
      // index keeps guarding duplicates and describeLadderEvent already renders it. source_type
      // carries the "this came from a cycle reset, not a mid-cycle seed" fact.
      event_type: "cycle_start",
      tier_before_id: null,
      tier_after_id: p.tier_id,
      stars_before: null,
      stars_after: p.stars,
      cushion_available: true,
      source_type: "cycle_reset",
      source_id: null,
      occurred_at: startsAt,
      metadata: {
        seed_rating: p.rating,
        previous_cycle_id: previousCycle?.id ?? null,
        previous_tier_id: p.previous_tier_id,
        previous_stars: p.previous_stars,
      },
    }));

    const { error: insertError } = await supabase.from("ladder_standing_events").insert(chunk);
    if (insertError) {
      return { ok: false, error: `Failed to place players: ${insertError.message} ${halfBuilt}` };
    }
  }

  if (duoAvailable && duoPlacements.length > 0) {
    const duoWriteError = await writeDuoCyclePlacements(supabase, {
      cycleId,
      placements: duoPlacements,
      startsAt,
      previousCycleId: previousCycle?.id ?? null,
    });
    if (duoWriteError) {
      return { ok: false, error: `Failed to place duos: ${duoWriteError} ${halfBuilt}` };
    }
  }

  const { error: activateError } = await supabase
    .from("ladder_cycles")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", cycleId);

  if (activateError) {
    return {
      ok: false,
      error: `Placements were written, but activating the cycle failed: ${activateError.message} ${halfBuilt}`,
    };
  }

  return {
    ok: true,
    cycle: { id: cycleId, label, status: "active", starts_at: startsAt },
    placements,
    namesByPlayer: Object.fromEntries(namesByPlayer),
    distribution,
    previousCycle,
    duoAvailable,
    duoPlacements,
    duoLabels,
    duoDistribution,
    written: true,
    warnings,
  };
}
