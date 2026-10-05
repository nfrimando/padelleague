import type { SupabaseClient } from "@supabase/supabase-js";
import type { TierBucketRow } from "@/lib/ladder/ladderPlacement";
import { isMissingTableError } from "@/lib/ladder/ladderSchema";

type TierRow = { id: number; name: string; rank: number; elo_floor: number | string };
type CycleTierRow = { tier_id: number | string; elo_floor: number | string };

// The tier definitions as a given cycle runs them: tier identity (id / name / rank) always comes
// from ladder_tiers, but elo_floor is overridden by that cycle's ladder_cycle_tiers snapshot when
// one exists. Cycles predating the snapshot table fall back to the global ladder_tiers.elo_floor.
//
// Use this anywhere elo_floor is actually consumed (i.e. placeByRating) so a player joining
// mid-cycle is bucketed by the same cutoffs everyone else in that cycle was placed by. Call sites
// that only need id / name / rank can keep selecting ladder_tiers directly.
//
// mode "duo" reads the duo ladder's floors (ladder_cycle_duo_tiers) instead — same tiers, different
// cutoffs, since a duo is placed by the average of its two players' ratings.
export async function fetchTiersForCycle(
  client: SupabaseClient,
  cycleId: number,
  mode: "solo" | "duo" = "solo",
): Promise<{ tiers: TierBucketRow[]; error: string | null }> {
  const { data: tiersData, error: tiersError } = await client
    .from("ladder_tiers")
    .select("id, name, rank, elo_floor")
    .order("rank", { ascending: true });

  if (tiersError) return { tiers: [], error: tiersError.message };
  if (!tiersData || tiersData.length === 0) {
    return { tiers: [], error: "No ladder tiers configured." };
  }

  const { data: overrideData, error: overrideError } = await client
    .from(mode === "duo" ? "ladder_cycle_duo_tiers" : "ladder_cycle_tiers")
    .select("tier_id, elo_floor")
    .eq("cycle_id", cycleId);

  // Migrations in this repo are applied by hand, so the code can reach production before
  // 20261001000000_add_ladder_cycle_tiers.sql has been run. A missing table means "no snapshot",
  // which is already a supported state (cycles predating it) — treat it as such rather than
  // taking the public /ladder page down for the length of that window. Any other error is real
  // and is surfaced.
  if (overrideError && !isMissingTableError(overrideError)) {
    return { tiers: [], error: overrideError.message };
  }

  const floorByTier = new Map<string, number>();
  for (const row of (overrideData ?? []) as CycleTierRow[]) {
    const floor = Number(row.elo_floor);
    if (Number.isFinite(floor)) floorByTier.set(String(row.tier_id), floor);
  }

  const tiers = (tiersData as TierRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    rank: t.rank,
    elo_floor: floorByTier.get(String(t.id)) ?? Number(t.elo_floor),
  }));

  return { tiers, error: null };
}
