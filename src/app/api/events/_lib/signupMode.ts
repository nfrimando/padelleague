import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export type SignupMode = "individual" | "paired";

export function parseSignupMode(value: unknown): SignupMode | null {
  return value === "individual" || value === "paired" ? value : null;
}

/**
 * Reconcile existing signups when a host flips an event between individual and
 * paired. Call BEFORE writing the new mode.
 *
 * Switching away from paired while pairs are live would leave pair_ids that no
 * longer mean anything, so it's refused until the host resolves them. Switching
 * into paired puts everyone already signed up into the "looking for a partner"
 * pool, which is where they actually are.
 */
export async function reconcileSignupModeChange(
  client: Client,
  eventId: number,
  from: SignupMode,
  to: SignupMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (from === to) return { ok: true };

  if (to === "individual") {
    const { data: livePairs } = await client
      .from("event_signup_pairs")
      .select("id")
      .eq("event_id", eventId)
      .in("status", ["pending", "accepted"])
      .limit(1);

    if ((livePairs ?? []).length > 0) {
      return {
        ok: false,
        error:
          "This event still has partner pairs or pending invites. Resolve those first, then switch to individual signups.",
      };
    }

    const { error } = await client
      .from("signups_events")
      .update({ looking_for_partner: false, updated_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("looking_for_partner", true);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // individual → paired
  const { error } = await client
    .from("signups_events")
    .update({ looking_for_partner: true, updated_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .is("pair_id", null);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
