import type { SupabaseClient } from "@supabase/supabase-js";

export const RECALIBRATION_COOLDOWN_DAYS = 90;

export type RecalibrationCooldownStatus = {
  eligible: boolean;
  nextEligibleAt: string | null;
  lastRequestedAt: string | null;
};

// The cooldown is based on the player's most recent non-cancelled request — a
// cancelled request (e.g. due to suspected influence) never blocks a new one.
export async function getRecalibrationCooldownStatus(
  serviceClient: SupabaseClient,
  playerId: number,
): Promise<RecalibrationCooldownStatus> {
  const { data } = await serviceClient
    .from("recalibration_requests")
    .select("requested_at")
    .eq("player_id", playerId)
    .neq("status", "cancelled")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { eligible: true, nextEligibleAt: null, lastRequestedAt: null };
  }

  const lastRequestedAt = data.requested_at as string;
  const last = new Date(lastRequestedAt);
  const next = new Date(last.getTime() + RECALIBRATION_COOLDOWN_DAYS * 86_400_000);

  return {
    eligible: Date.now() >= next.getTime(),
    nextEligibleAt: next.toISOString(),
    lastRequestedAt,
  };
}
