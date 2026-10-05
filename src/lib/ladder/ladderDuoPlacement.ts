import type { SupabaseClient } from "@supabase/supabase-js";
import { placeByRating, type TierBucketRow } from "@/lib/ladder/ladderPlacement";
import { fetchTiersForCycle } from "@/lib/ladder/ladderCycleTiers";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import { fetchLatestRatingsByPlayerIds } from "@/lib/ratingLedger";
import type { LadderStanding } from "@/lib/ladder/ladderStandingTransition";

// Duo ladder placement. A duo is placed exactly like a solo player (placeByRating: highest tier whose
// floor it clears, thirds of the tier for 0★/1★/2★) using the AVERAGE of its two players' current
// ratings (player_rating_events ledger) against the cycle's DUO floors (ladder_cycle_duo_tiers).

export type DuoMembers = { id: number; player_low_id: number; player_high_id: number };

// Average of the two ratings, or null when either player has no resolvable rating.
export function averageDuoRating(
  ratingA: number | null | undefined,
  ratingB: number | null | undefined,
): number | null {
  if (ratingA == null || ratingB == null) return null;
  if (!Number.isFinite(ratingA) || !Number.isFinite(ratingB)) return null;
  return (ratingA + ratingB) / 2;
}

export function placeDuoByRatings(
  ratingA: number | null | undefined,
  ratingB: number | null | undefined,
  tiers: TierBucketRow[],
): { tierId: number; stars: number; rating: number } | null {
  const rating = averageDuoRating(ratingA, ratingB);
  if (rating == null) return null;
  const placement = placeByRating(rating, tiers);
  return placement ? { ...placement, rating } : null;
}

type LatestDuoStandingRow = {
  duo_id: number | string;
  tier_after_id: number;
  stars_after: number;
  cushion_available: boolean;
};

// Latest ladder_duo_standing_events row per duo in the cycle. Mirrors fetchLatestLadderStandings.
// Duos with no row this cycle are absent from the map.
export async function fetchLatestDuoStandings(
  client: SupabaseClient,
  cycleId: number,
  duoIds: Array<number | string>,
): Promise<Map<string, LadderStanding>> {
  const result = new Map<string, LadderStanding>();
  const ids = Array.from(
    new Set(duoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  );
  if (ids.length === 0) return result;

  const { data, error } = await client
    .from("ladder_duo_standing_events")
    .select("duo_id, tier_after_id, stars_after, cushion_available")
    .eq("cycle_id", cycleId)
    .in("duo_id", ids)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error || !data) return result;

  for (const row of data as LatestDuoStandingRow[]) {
    const key = String(row.duo_id);
    if (result.has(key)) continue;
    result.set(key, {
      tierId: row.tier_after_id,
      stars: row.stars_after,
      cushionAvailable: row.cushion_available,
    });
  }
  return result;
}

// Places any of `duoIds` that have no standing row in `cycleId` yet, writing a real
// cycle_start / source_type='cycle_seed' row each. Duos with an unrated player are skipped and
// reported in `warnings`. The duo ladder's counterpart of ensureLadderPlacement: used when a duo is
// formed mid-cycle, on queue join, and at match completion.
export async function ensureDuoPlacement(
  supabase: SupabaseClient,
  cycleId: number,
  duoIds: number[],
  occurredAt: string = new Date().toISOString(),
): Promise<{ standingsByDuo: Map<string, LadderStanding>; warnings: string[] }> {
  const warnings: string[] = [];
  const uniqueIds = Array.from(new Set(duoIds));

  const standingsByDuo = await fetchLatestDuoStandings(supabase, cycleId, uniqueIds);
  const missing = uniqueIds.filter((id) => !standingsByDuo.has(String(id)));
  if (missing.length === 0) return { standingsByDuo, warnings };

  const { data: duosData, error: duosError } = await supabase
    .from("ladder_duos")
    .select("id, player_low_id, player_high_id")
    .in("id", missing);
  if (duosError) {
    warnings.push(`Failed to load duos: ${duosError.message}`);
    return { standingsByDuo, warnings };
  }
  const duos = (duosData ?? []) as DuoMembers[];

  const { tiers, error: tiersError } = await fetchTiersForCycle(supabase, cycleId, "duo");
  if (tiersError || tiers.length === 0) {
    warnings.push(tiersError || "No ladder tiers configured.");
    return { standingsByDuo, warnings };
  }

  const ratings = await fetchLatestRatingsByPlayerIds(
    supabase,
    duos.flatMap((d) => [d.player_low_id, d.player_high_id]),
  );

  for (const duo of duos) {
    const lowRating = ratings.get(String(duo.player_low_id)) ?? null;
    const highRating = ratings.get(String(duo.player_high_id)) ?? null;
    const placement = placeDuoByRatings(lowRating, highRating, tiers);
    if (!placement) {
      warnings.push(
        lowRating == null || highRating == null
          ? `Duo ${duo.id} has a player with no rating yet; not placed.`
          : `Duo ${duo.id} could not be placed into a tier.`,
      );
      continue;
    }

    const { error: seedError } = await supabase.from("ladder_duo_standing_events").insert({
      cycle_id: cycleId,
      duo_id: duo.id,
      event_type: "cycle_start",
      tier_before_id: null,
      tier_after_id: placement.tierId,
      stars_before: null,
      stars_after: placement.stars,
      cushion_available: true,
      source_type: "cycle_seed",
      source_id: null,
      occurred_at: occurredAt,
      metadata: {
        seed_rating: placement.rating,
        member_ratings: {
          [duo.player_low_id]: lowRating,
          [duo.player_high_id]: highRating,
        },
      },
    });

    // 23505 = uniq_ldse_cycle_start: a concurrent caller placed it first. Re-read below.
    if (seedError && seedError.code !== "23505") {
      warnings.push(`Failed to place duo ${duo.id}: ${seedError.message}`);
      continue;
    }

    if (seedError) {
      const reread = await fetchLatestDuoStandings(supabase, cycleId, [duo.id]);
      const standing = reread.get(String(duo.id));
      if (standing) standingsByDuo.set(String(duo.id), standing);
      continue;
    }

    standingsByDuo.set(String(duo.id), {
      tierId: placement.tierId,
      stars: placement.stars,
      cushionAvailable: true,
    });
  }

  return { standingsByDuo, warnings };
}

// Places one duo into the active cycle if it isn't placed yet. Never throws — callers (accept,
// admin create) must not fail because of a ladder problem; they surface `warnings` as ladderWarning.
export async function placeDuoInActiveCycle(
  supabase: SupabaseClient,
  duoId: number,
): Promise<{ placed: boolean; warnings: string[] }> {
  try {
    const cycleId = await fetchActiveCycleId(supabase);
    if (!cycleId) return { placed: false, warnings: ["No active ladder cycle; duo not placed yet."] };
    const { standingsByDuo, warnings } = await ensureDuoPlacement(supabase, cycleId, [duoId]);
    return { placed: standingsByDuo.has(String(duoId)), warnings };
  } catch (err) {
    return {
      placed: false,
      warnings: [err instanceof Error ? err.message : "Duo placement failed."],
    };
  }
}
