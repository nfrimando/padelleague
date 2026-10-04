import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureLadderPlacement } from "@/lib/ladder/ladderPlacement";
import {
  computeNextLadderStanding,
  type LadderTierRow,
} from "@/lib/ladder/ladderStandingTransition";
import { fetchActiveCycleId, syncWaitingEntriesToStanding } from "@/lib/ladder/ladderQueue";

export type AdminAdjustmentResult =
  | {
      ok: true;
      tierBeforeId: number;
      tierAfterId: number;
      starsBefore: number;
      starsAfter: number;
      transition: string;
    }
  | { ok: false; error: string };

// Admin ±1 star, case by case (penalty for a backout, correction, bonus). Per the CLAUDE.md ledger
// rule this is its own ladder_standing_events row — event_type 'admin_adjustment',
// source_type 'admin' — never an edit of an existing row.
//
// +1 behaves exactly like a win (can promote); −1 exactly like a loss — including the cushion, so a
// 0★ penalty with the cushion unused spends the cushion rather than demoting.
export async function applyAdminStarAdjustment(
  supabase: SupabaseClient,
  params: { playerId: number; delta: 1 | -1; reason: string; adminUserId: string },
): Promise<AdminAdjustmentResult> {
  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) return { ok: false, error: "No active ladder cycle." };

  const { data: tiersData, error: tiersError } = await supabase
    .from("ladder_tiers")
    .select("id, rank");
  if (tiersError || !tiersData || tiersData.length === 0) {
    return { ok: false, error: tiersError?.message ?? "No ladder tiers configured." };
  }

  const { standingsByPlayer, warnings } = await ensureLadderPlacement(supabase, cycleId, [
    params.playerId,
  ]);
  const current = standingsByPlayer.get(String(params.playerId));
  if (!current) {
    return { ok: false, error: warnings[0] ?? "Player has no ladder standing this cycle." };
  }

  const next = computeNextLadderStanding(
    current,
    params.delta === 1 ? "win" : "loss",
    tiersData as LadderTierRow[],
  );

  const { error: insertError } = await supabase.from("ladder_standing_events").insert({
    cycle_id: cycleId,
    player_id: params.playerId,
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
    await syncWaitingEntriesToStanding(supabase, cycleId, [params.playerId]);
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
