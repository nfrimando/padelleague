import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTableError } from "@/lib/ladder/ladderSchema";

type StrikeSubject = "player_id" | "duo_id";

// Folds the admin's manual ±1 corrections (ladder_strike_adjustments) into derived backout counts,
// flooring at 0. A missing table (migration not applied yet) just means no adjustments.
export async function addStrikeAdjustments(
  supabase: SupabaseClient,
  cycleId: number,
  subject: StrikeSubject,
  counts: Map<number, number>,
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("ladder_strike_adjustments")
    .select(`${subject}, delta`)
    .eq("cycle_id", cycleId)
    .not(subject, "is", null);

  if (error) {
    if (!isMissingTableError(error)) console.error("[ladder-strikes] failed to read adjustments:", error);
    return counts;
  }

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = Number(row[subject]);
    counts.set(id, (counts.get(id) ?? 0) + Number(row.delta ?? 0));
  }
  for (const [id, count] of counts) {
    if (count <= 0) counts.delete(id);
  }
  return counts;
}

// Records one manual strike change for a player (solo) or duo. Removing a strike from someone at 0
// is refused so the ledger never banks "credit" against future backouts.
export async function applyStrikeAdjustment(
  supabase: SupabaseClient,
  params: {
    cycleId: number;
    subject: { playerId: number } | { duoId: number };
    currentStrikes: number;
    delta: 1 | -1;
    reason: string;
    adminUserId: string;
  },
): Promise<{ ok: true; strikes: number } | { ok: false; error: string }> {
  if (params.delta === -1 && params.currentStrikes <= 0) {
    return { ok: false, error: "No strikes to remove." };
  }

  const { error } = await supabase.from("ladder_strike_adjustments").insert({
    cycle_id: params.cycleId,
    player_id: "playerId" in params.subject ? params.subject.playerId : null,
    duo_id: "duoId" in params.subject ? params.subject.duoId : null,
    delta: params.delta,
    reason: params.reason,
    admin_user_id: params.adminUserId,
  });

  if (error) {
    return {
      ok: false,
      error: isMissingTableError(error)
        ? "Strike adjustments aren't enabled yet — apply the 20261013000000 migration."
        : error.message,
    };
  }
  return { ok: true, strikes: params.currentStrikes + params.delta };
}
