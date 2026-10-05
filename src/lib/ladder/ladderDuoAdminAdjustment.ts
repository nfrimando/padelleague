import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDuoPlacement } from "@/lib/ladder/ladderDuoPlacement";
import { syncWaitingDuoEntriesToStanding } from "@/lib/ladder/ladderDuoQueue";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import {
  computeNextLadderStanding,
  type LadderTierRow,
} from "@/lib/ladder/ladderStandingTransition";
import type { AdminAdjustmentResult } from "@/lib/ladder/ladderAdminAdjustment";

// Admin ±1 star for a DUO (backout penalty, correction, bonus). Same rules as
// applyAdminStarAdjustment: its own ladder_duo_standing_events row (event_type 'admin_adjustment',
// source_type 'admin'); +1 behaves like a win, −1 like a loss including the cushion.
export async function applyAdminDuoStarAdjustment(
  supabase: SupabaseClient,
  params: { duoId: number; delta: 1 | -1; reason: string; adminUserId: string },
): Promise<AdminAdjustmentResult> {
  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) return { ok: false, error: "No active ladder cycle." };

  const { data: tiersData, error: tiersError } = await supabase.from("ladder_tiers").select("id, rank");
  if (tiersError || !tiersData || tiersData.length === 0) {
    return { ok: false, error: tiersError?.message ?? "No ladder tiers configured." };
  }

  const { standingsByDuo, warnings } = await ensureDuoPlacement(supabase, cycleId, [params.duoId]);
  const current = standingsByDuo.get(String(params.duoId));
  if (!current) {
    return { ok: false, error: warnings[0] ?? "Duo has no ladder standing this cycle." };
  }

  const next = computeNextLadderStanding(
    current,
    params.delta === 1 ? "win" : "loss",
    tiersData as LadderTierRow[],
  );

  const { error: insertError } = await supabase.from("ladder_duo_standing_events").insert({
    cycle_id: cycleId,
    duo_id: params.duoId,
    event_type: "admin_adjustment",
    tier_before_id: next.tierBeforeId,
    tier_after_id: next.tierAfterId,
    stars_before: next.starsBefore,
    stars_after: next.starsAfter,
    cushion_available: next.cushionAvailable,
    source_type: "admin",
    source_id: null,
    occurred_at: new Date().toISOString(),
    metadata: {
      delta: params.delta,
      reason: params.reason,
      admin_user_id: params.adminUserId,
      transition: next.eventType,
    },
  });
  if (insertError) return { ok: false, error: insertError.message };

  if (next.tierAfterId !== next.tierBeforeId) {
    await syncWaitingDuoEntriesToStanding(supabase, cycleId, [params.duoId]);
  }

  return {
    ok: true,
    tierBeforeId: next.tierBeforeId,
    tierAfterId: next.tierAfterId,
    starsBefore: next.starsBefore,
    starsAfter: next.starsAfter,
    transition: next.eventType,
  };
}
