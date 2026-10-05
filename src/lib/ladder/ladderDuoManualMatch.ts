import type { SupabaseClient } from "@supabase/supabase-js";
import { adminCreateDuo, loadDuoByPair } from "@/lib/ladder/ladderDuos";
import { ensureDuoPlacement } from "@/lib/ladder/ladderDuoPlacement";
import { fetchActiveCycleId } from "@/lib/ladder/ladderQueue";
import { isDuoLadderAvailable } from "@/lib/ladder/ladderSchema";

// Flags an admin-created match as a Duo Ladder match (ladder_duo_matches row, source 'manual').
// Each team must be an active duo; with `createMissingDuos` a missing/inactive pair is created as an
// active duo on the spot. Non-fatal by contract, like the solo ladderWarning in create/route.ts: the
// match itself is already created, so problems come back as a warning string.
export async function recordManualDuoLadderMatch(
  supabase: SupabaseClient,
  params: {
    matchId: number;
    team1: [number, number];
    team2: [number, number];
    createMissingDuos: boolean;
    adminUserId: string | null;
  },
): Promise<string | null> {
  if (!(await isDuoLadderAvailable(supabase))) {
    return "Match created, but the duo ladder isn't enabled yet — it was not counted toward the duo ladder.";
  }

  const cycleId = await fetchActiveCycleId(supabase);
  if (!cycleId) {
    return "Match created, but no active ladder cycle was found — it was not counted toward the duo ladder.";
  }

  const duoIds: number[] = [];
  const warnings: string[] = [];
  for (const [index, team] of [params.team1, params.team2].entries()) {
    const existing = await loadDuoByPair(supabase, team[0], team[1]);
    if (existing?.status === "active") {
      duoIds.push(existing.id);
      continue;
    }
    if (!params.createMissingDuos) {
      return `Match created, but team ${index + 1} isn't an active duo — it was not counted toward the duo ladder. Tick "create duo" to form it automatically.`;
    }
    const created = await adminCreateDuo(supabase, {
      playerA: team[0],
      playerB: team[1],
      name: null,
      adminUserId: params.adminUserId,
    });
    if (!created.ok) {
      return `Match created, but forming team ${index + 1}'s duo failed (${created.error}) — not counted toward the duo ladder.`;
    }
    if (created.ladderWarning) warnings.push(created.ladderWarning);
    duoIds.push(created.duo.id);
  }

  const { standingsByDuo, warnings: placementWarnings } = await ensureDuoPlacement(supabase, cycleId, duoIds);
  warnings.push(...placementWarnings);

  const tier1 = standingsByDuo.get(String(duoIds[0]))?.tierId ?? null;
  const tier2 = standingsByDuo.get(String(duoIds[1]))?.tierId ?? null;
  if (tier1 != null && tier2 != null && tier1 !== tier2) {
    warnings.push("Heads up: the two duos are in different tiers.");
  }

  const { error } = await supabase.from("ladder_duo_matches").insert({
    match_id: params.matchId,
    cycle_id: cycleId,
    team1_duo_id: duoIds[0],
    team2_duo_id: duoIds[1],
    tier_id: tier1 ?? tier2,
    source: "manual",
  });
  if (error) {
    console.error("[ladder] Failed to record ladder_duo_matches row:", error);
    return "Match created, but failed to record it as a duo ladder match.";
  }

  return warnings.length > 0 ? warnings.join(" ") : null;
}
